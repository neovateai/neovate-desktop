# ACP Connection Design

**Date:** 2026-02-28

## Context

The app needs to manage ACP (Agent Client Protocol) connections between the main process and agent processes (e.g., claude-code). The current implementation creates one connection per session, spawning a new agent process each time. This is wasteful when multiple sessions use the same agent type.

This design was informed by:
- **claude-code-acp** (zed-industries/claude-code-acp) — the ACP server implementation. Confirmed that `newSession({ cwd })` supports different working directories per session on the same connection. Each session gets its own `SettingsManager`, `Query` subprocess, and `cwd`. cwd is session-level, not process-level
- **DeepChat** (ThinkInAIXYZ/deepchat) — uses one connection per agent+workdir pair via `AcpProcessManager`. This is more conservative than necessary given claude-code-acp's per-session cwd support

## Discussion

### Key Finding

claude-code-acp's `newSession()` accepts a `cwd` parameter. Each session on the same connection can have a completely different working directory. Internally, each session creates its own:
- `SettingsManager` initialized with that session's cwd
- `Query` with `Options.cwd` set per-session
- Project-specific settings loaded from `<cwd>/.claude/settings.json`

This means one process/connection per agent type is sufficient for the entire app, regardless of how many projects or sessions exist.

### Alternatives Considered

- **One connection per session** (current design): wasteful, spawns a new process for every conversation
- **One connection per agent+workdir** (DeepChat pattern): unnecessary; claude-code-acp handles per-session cwd natively
- **One connection per agent type** (chosen): minimal resource usage, fully supported by the ACP protocol

## Approach

One ACP connection per agent type, managed entirely in the main process. The renderer store does not know about connections — it only stores `agentId` on each session. The main process handles connection lifecycle, session creation, and event routing.

See [Store Design](./2026-02-28-store-design-projects-sessions.md) for the renderer-side architecture.

## Architecture

### Overview

```
Main Process
 └── AcpConnectionManager
      └── connections: Map<agentId, ManagedConnection>
           └── "claude-code" → one spawned process, one ACP connection
                ├── Session 1 (cwd: /my-app)       ← Project A
                ├── Session 2 (cwd: /my-app)       ← Project A
                └── Session 3 (cwd: /other-app)    ← Project B
```

### Types (Main Process)

```typescript
type ManagedConnection = {
  agentId: string
  process: ChildProcess
  connection: ClientSideConnection   // from @agentclientprotocol/sdk
  sessions: Map<string, ManagedSession>
}

type ManagedSession = {
  sessionId: string
  cwd: string
  // event subscriptions, permission handlers, etc.
}
```

### Connection Lifecycle

```
1. First session created for agent type
   → Spawn agent process (e.g., npx claude-code-acp)
   → Initialize ACP connection (stdin/stdout)
   → Store in connections map
   → Call connection.newSession({ cwd })

2. Subsequent sessions for same agent type
   → Reuse existing connection
   → Call connection.newSession({ cwd })

3. All sessions for an agent type closed
   → Optionally keep connection alive (warm) for fast reconnect
   → Or kill process and remove from map

4. App quit
   → Kill all agent processes
```

### Session Creation Flow

```
Renderer                          Main Process
   │                                   │
   ├─ RPC: newSession(agentId, cwd) ──►│
   │                                   ├─ connections.get(agentId)
   │                                   │  ├─ exists? reuse
   │                                   │  └─ not found? spawn + connect
   │                                   │
   │                                   ├─ connection.newSession({ cwd })
   │                                   │  └─ returns sessionId
   │                                   │
   │◄─ { sessionId } ─────────────────┤
   │                                   │
   ├─ store.createSession(sessionId) ──│
   │                                   │
```

### Event Routing

Each session has its own event stream. The main process routes events by sessionId:

```
Agent Process → ACP events (sessionId in each event)
  │
  └─ Main Process dispatches by sessionId
      ├─ Session 1 events → renderer (if subscribed)
      ├─ Session 2 events → renderer (if subscribed)
      └─ Session 3 events → renderer (if subscribed)
```

This works with the existing oRPC streaming pattern — each `prompt()` call subscribes to events for that specific sessionId.

### Prompt Flow

```
Renderer                          Main Process
   │                                   │
   ├─ RPC: prompt(sessionId, text) ───►│
   │                                   ├─ find connection by sessionId
   │                                   ├─ connection.prompt(sessionId, text)
   │                                   │
   │◄─ stream: SessionEvent ──────────┤  (async iterator)
   │◄─ stream: SessionEvent ──────────┤
   │◄─ stream: SessionEvent ──────────┤
   │◄─ return: PromptResult ──────────┤
   │                                   │
```

### Error Handling

- **Agent process crashes**: Remove connection from map, mark all its sessions as errored in renderer
- **Session error**: Only affects that session, connection stays alive for other sessions
- **Connection refused on spawn**: Retry with backoff, report error to renderer

### What's Deferred

- **Connection pooling** — multiple connections per agent type for load distribution
- **Connection health checks** — periodic pings to detect stale connections
- **Warm connection persistence** — keeping idle connections alive across project switches
