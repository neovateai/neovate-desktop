# ACP Integration Architecture

The Agent Communication Protocol (ACP) feature connects the Electron desktop app to external AI agents (e.g. Claude Code) via the `acpx` library. The architecture follows a three-layer pattern: **shared contract** defines the API, **main process** manages agent subprocesses, and the **renderer** provides the UI.

## System Overview

```
Shared Layer (contract + types)
  Defines oRPC schema & TypeScript types used by both sides.

Main Process Layer (connection-manager, connection, router, shell-env)
  Spawns agent subprocesses via acpx, manages connections,
  handles permission requests, streams events to renderer.

Renderer Layer (store, hooks, components)
  Zustand store for UI state, hooks for business logic,
  React components for chat/permissions/agent selection.

Transport: MessagePort + oRPC (structured clone serialization)
```

## File Map

```
packages/desktop/src/
  shared/features/acp/
    contract.ts          oRPC contract (API surface)
    types.ts             StreamEvent, PromptResult, AgentInfo

  main/features/acp/
    connection-manager.ts  Lifecycle of all agent connections
    connection.ts          Event publishing, permission handling
    router.ts              oRPC handler implementations
    shell-env.ts           Shell environment extraction
    index.ts               Re-exports

  renderer/src/features/acp/
    store.ts               Zustand store (sessions, messages, tools)
    hooks/
      use-acp-connect.ts   Connection + session creation
      use-acp-prompt.ts    Prompt streaming, cancellation
      use-acp-permission.ts  Permission resolution
    components/
      agent-chat.tsx       Main container
      agent-selector.tsx   Agent dropdown
      workdir-picker.tsx   Working directory input
      message-list.tsx     Message + thinking + tool display
      message-input.tsx    Text input + send/cancel
      permission-dialog.tsx  Permission request UI
```

## oRPC Contract

The shared contract (`contract.ts`) defines the complete RPC surface:

| Procedure           | Input                               | Output                                      | Notes                          |
| ------------------- | ----------------------------------- | ------------------------------------------- | ------------------------------ |
| `listAgents`        | none                                | `AgentInfo[]`                               | Discovers available agents     |
| `connect`           | `agentId, cwd?`                     | `{ connectionId }`                          | Spawns agent subprocess        |
| `newSession`        | `connectionId, cwd?`                | `{ sessionId }`                             | Creates ACP session            |
| `prompt`            | `connectionId, sessionId, prompt`   | `eventIterator<StreamEvent> + PromptResult` | Streaming generator            |
| `resolvePermission` | `connectionId, requestId, optionId` | `void`                                      | Responds to permission request |
| `cancel`            | `connectionId, sessionId`           | `void`                                      | Cancels active prompt          |
| `disconnect`        | `connectionId`                      | `void`                                      | Tears down connection          |

The `prompt` handler is an async generator that yields `StreamEvent` objects and returns a `PromptResult` with `stopReason`.

### Stream Events

```typescript
type StreamEvent =
  | { type: "acpx_event"; event: AcpxEvent } // Agent output, tool calls
  | { type: "permission_request"; requestId; data }; // Permission needed
```

## Main Process

### AcpConnectionManager

Manages the lifecycle of all agent connections. Each `connect()` call:

1. Extracts the user's shell environment (PATH, NVM, Volta, Bun paths)
2. Merges shell PATH with process PATH so `npx`, `node`, etc. are available
3. Resolves the agent command (with overrides, e.g. `claude` maps to `npx -y @zed-industries/claude-code-acp`)
4. Creates an `AcpClient` from acpx and starts the agent subprocess
5. Wires up callbacks for session updates, permission requests, and stderr capture

The manager stores connections in a `Map<string, ManagedConnection>` and keeps a per-connection stderr buffer (last 100 lines) for error diagnostics.

### AcpConnection

Wraps a single agent connection. Responsibilities:

- **Event publishing**: Converts acpx `SessionNotification` objects into `StreamEvent` and publishes them via `EventPublisher`. The prompt handler subscribes to this publisher.
- **Permission handling**: When the agent requests permission, creates a Promise stored in `pendingPermissions` with a 5-minute timeout. If the UI doesn't respond, the permission auto-cancels. The renderer calls `resolvePermission()` to fulfill the promise.
- **Cleanup**: `dispose()` cancels all pending permissions and clears timers.

### Router

Implements the oRPC contract handlers. Key patterns:

- `getConnection()` helper throws `ORPCError("NOT_FOUND")` for unknown connection IDs.
- `buildPromptError()` helper enriches errors with stderr tail (last 20 lines), agent exit code/signal, and lifecycle info.
- The `prompt` handler runs the agent prompt and event subscription in parallel: a Promise waits for the agent to finish while a `for await` loop yields events from the subscription. An internal `AbortController` (`done`) breaks the subscription loop when the prompt completes or fails.

## Renderer

### Zustand Store

Single source of truth for the ACP UI state:

```
AcpState
  agents: AgentInfo[]
  sessions: Map<sessionId, AcpSession>
  activeSessionId: string | null

AcpSession
  sessionId, connectionId
  messages: AcpMessage[]      // { id, role, content, thinking? }
  toolCalls: Map<id, state>   // { toolCallId, title, kind?, status? }
  streaming: boolean
  promptError: string | null
  pendingPermission: { requestId, data } | null
```

The `appendChunk()` action routes incoming `StreamEvent` objects:

- `permission_request` sets `pendingPermission`
- `acpx_event` with `output_delta` (stream `"output"`) appends to assistant message content
- `acpx_event` with `output_delta` (stream `"thought"`) appends to `message.thinking`
- `acpx_event` with `tool_call` adds/updates the tool call map

### Hooks

**`useAcpConnect`** - Calls `connect` then `newSession`, creates the store session, exposes `{ connect, connecting, error }`.

**`useAcpPrompt`** - Manages the streaming lifecycle:

1. Adds user message to store, sets streaming flag
2. Creates an `AbortController` for cancellation
3. Iterates the oRPC event stream, calling `appendChunk` for each event
4. On error, extracts a user-facing message from the oRPC error structure
5. Cleans up on unmount (aborts in-flight requests)

**`useAcpPermission`** - Calls `resolvePermission` RPC and clears the store's pending permission.

### Components

```
AgentChat (container)
  No session → AgentSelector + WorkdirPicker + Connect button
  Session active → MessageList + PermissionDialog + Error alert + MessageInput
```

## Data Flows

### Connect

```
User clicks Connect
  → useAcpConnect.connect(agentId, cwd)
    → RPC: connect({ agentId, cwd })
      → connectionManager.connect(): spawn subprocess, start AcpClient
    → RPC: newSession({ connectionId, cwd })
      → client.createSession(cwd)
    → store.createSession(sessionId, connectionId)
```

### Prompt Streaming

```
User sends message
  → useAcpPrompt.sendPrompt(connectionId, sessionId, prompt)
    → store.addUserMessage(), store.setStreaming(true)
    → RPC: prompt({ connectionId, sessionId, prompt })
      → [Main] client.prompt() + subscribeSession() in parallel
      → [Main] yields StreamEvent as they arrive
    → [Renderer] for await event: store.appendChunk(sessionId, event)
      → UI updates: messages, thinking, tool calls
    → store.setStreaming(false)
```

### Permission Request

```
Agent requests permission
  → [Main] AcpClient.onRequestPermission(params)
    → connection.handlePermissionRequest(): create pending promise (5min timeout)
    → publish { type: "permission_request" } into event stream
  → [Renderer] appendChunk() sets pendingPermission
    → PermissionDialog renders

User clicks Allow
  → useAcpPermission.resolvePermission()
    → RPC: resolvePermission({ connectionId, requestId, optionId })
      → [Main] connection.resolvePermission(): fulfill promise, clear timer
    → [Subprocess] agent receives permission response, continues
```

## Transport (Main ↔ Renderer)

```
Renderer                    Preload                     Main
  MessageChannel              window.message              ipcMain
  port1 → RPCLink           → forward port2            → RPCHandler.upgrade(port)
  createORPCClient(link)       via ipcRenderer             handler serves contract
```

The renderer creates a `MessageChannel`, sends one port through the preload bridge to the main process. oRPC uses structured clone serialization over the port — no JSON overhead, supports typed arrays and complex objects.

## Error Handling

| Layer             | Pattern                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Connect           | `AgentSpawnError` / `Error` caught, wrapped as `ORPCError("BAD_GATEWAY")` with descriptive message                                  |
| Prompt (main)     | Agent errors enriched with stderr tail (20 lines), exit code, signal, `unexpectedDuringPrompt` flag                                 |
| Prompt (renderer) | Extracts message from `error.data.message` → `error.message` → fallback string. AbortError silently ignored.                        |
| Permission        | 5-minute timeout auto-cancels with `{ outcome: "cancelled" }`                                                                       |
| Router handlers   | `getConnection()` throws `ORPCError("NOT_FOUND")` for unknown connections. `cancel`/`disconnect` have try/catch with debug logging. |

## Debugging

Set `ACP_DEBUG=1` to enable verbose logging in the main process router. Logs include connection lifecycle, first 10 events per prompt, error details with stderr and lifecycle snapshots.

In the renderer, debug logging is enabled when `import.meta.env.DEV` is true (development mode).

## acpx Library

The `acpx` library (`github:neovateai/acpx`) provides the core agent communication layer:

| Export                         | Purpose                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| `AcpClient`                    | Spawns and communicates with agent subprocess                     |
| `listBuiltInAgents()`          | Discovers available agents                                        |
| `resolveAgentCommand()`        | Resolves agent name to shell command                              |
| `AgentSpawnError`              | Error type for spawn failures                                     |
| `formatErrorMessage()`         | Normalizes error objects to strings                               |
| `sessionUpdateToEventDrafts()` | Converts `SessionNotification` to event drafts                    |
| `createAcpxEvent()`            | Wraps event draft with metadata (session ID, sequence, timestamp) |

Agent overrides are defined in `connection-manager.ts`:

```typescript
const AGENT_OVERRIDES = {
  claude: "npx -y @zed-industries/claude-code-acp",
};
```
