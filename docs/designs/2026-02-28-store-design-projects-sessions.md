# Store Design: Projects, Sessions & Messages

**Date:** 2026-02-28

## Context

The current neovate-desktop store is a single flat Zustand store (`useAcpStore`) that holds agents, sessions, and messages in one place. Sessions are ephemeral, there is no project/workspace concept, and messages are plain strings. As the app grows to support multiple agents running in parallel and richer conversation features, we need a more structured store design.

This design was informed by:

- **neovate-code-desktop** (neovateai/neovate-code-desktop) — uses a slice-based Zustand store with a Repo → Workspace → Session → Message hierarchy, per-session processing state, and agent progress tracking
- **DeepChat** (ThinkInAIXYZ/deepchat) — mature multi-provider chat client with Pinia stores, conversation branching, and structured message blocks

## Discussion

### Key Questions Resolved

**What is a project?**
A project is a workspace/folder — a named directory on disk. Users explicitly create projects by picking a folder and name. No auto-creation from agent connections.

**How do sessions relate to projects?**
Sessions live under a project. A project can have multiple concurrent sessions. Sessions are agent-agnostic — the user can switch agents within the same session.

**Can multiple agents run in parallel?**
Yes. Each session holds its own `streaming`, `pendingPermission`, and `promptError`, so multiple sessions can stream simultaneously without conflict.

**Single store or split stores?**
Single Zustand store. Projects, sessions, and messages all live together. Simpler mental model, acceptable re-render characteristics for our scale.

**UI navigation model?**
No tabs for now. Simple `currentProjectId` / `currentSessionId` selection. The user views one session at a time while others run in the background. Tab support can be added later without changing the store shape.

**Message content model?**
Keep messages as simple strings for now (`content: string`, `thinking?: string`). Structured blocks (text, thinking, tool_call, error, etc.) will be designed separately in a future iteration.

**Naming convention?**
Use `currentXxx` instead of `activeXxx` for UI selection state — it reads as "what you're looking at now" rather than implying active/inactive status.

### Alternatives Considered

- **Split stores by domain** (separate project/session/message stores): rejected for simplicity; cross-store coordination adds wiring with little benefit at current scale
- **Repo → Workspace → Session hierarchy** (neovate-code-desktop pattern): too git-centric for our use case; a flat Project concept is simpler and sufficient
- **Auto-create projects from folder**: rejected in favor of explicit creation for clearer user intent

## Approach

A single Zustand store with normalized maps for projects, sessions, and messages. Projects are the top-level grouping (one per workspace folder). Sessions are agent-agnostic conversations that can run in parallel under a project. Messages stay simple strings for now with a clear path to structured blocks later.

ACP connection management is handled entirely in the main process — see [ACP Connection Design](./2026-02-28-acp-connection-design.md).

## Architecture

### Types

```typescript
type Project = {
  id: string;
  name: string;
  path: string; // workspace directory
  createdAt: number;
};

type Session = {
  id: string;
  projectId: string; // FK -> Project
  agentId: string; // which agent type (connection managed in main process)
  streaming: boolean;
  promptError: string | null;
  pendingPermission: PendingPermission | null;
  createdAt: number;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
};
```

### Store Shape

```typescript
type Store = {
  // Entities
  projects: Map<string, Project>;
  sessions: Map<string, Session>;
  messages: Map<string, Message[]>; // keyed by sessionId

  // UI selection
  currentProjectId: string | null;
  currentSessionId: string | null;

  // Agent registry
  agents: AgentInfo[];
};
```

### Entity Relationships

```
Project A (/my-app)
 ├── Session 1 → agentId: "claude-code", streaming: true
 └── Session 2 → agentId: "claude-code", streaming: false

Project B (/other-app)
 └── Session 3 → agentId: "claude-code", streaming: true

messages["1"] → Message[]
messages["2"] → Message[]
messages["3"] → Message[]
```

### Derived Data (selectors, not stored)

```typescript
// Sessions for current project
currentProjectSessions = sessions filtered by s.projectId === currentProjectId

// Current session object
currentSession = sessions.get(currentSessionId)

// Messages for current session
currentMessages = messages.get(currentSessionId)
```

### Key Behaviors

| Action         | Effect                                                               |
| -------------- | -------------------------------------------------------------------- |
| Create project | User picks folder + name, new Project added to map                   |
| New session    | RPC to main process, which creates ACP session and returns sessionId |
| Switch agent   | Update session's `agentId`, main process handles connection swap     |
| Delete project | Remove project, all its sessions, and their messages                 |
| Switch project | Update `currentProjectId`, optionally clear `currentSessionId`       |
| Switch session | Update `currentSessionId`                                            |

### What's Deferred

- **Structured message blocks** — text, thinking, tool_call, error as typed blocks inside assistant messages
- **Tool call placement** — inline blocks vs separate map on session
- **Tab UI** — opening multiple sessions as tabs
- **Persistence** — saving projects/sessions to disk
- **Session history** — browsing/searching past sessions
