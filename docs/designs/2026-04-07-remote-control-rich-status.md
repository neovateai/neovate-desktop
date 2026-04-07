# Remote Control: Rich Status & Command Info

**Date:** 2026-04-07
**Approach:** Enrich CommandHandler (Approach A — minimal, no new abstractions)

## Problem

Remote control commands (`/status`, `/chats`, `/repos`, `/start`) return minimal information. Users monitoring sessions remotely can't see session state, model, token usage, git context, or recent activity without switching to the desktop app.

## Design

### `/status` — Rich session dashboard

**Before:**

```
Linked to session in: /path/to/project
Session ID: abc-123
```

**After:**

```
📍 neovate-desktop-5 (master)
🤖 claude-opus-4-6 via Anthropic
⏱ Active 23m · Running: `bun test`

📊 Context: 62% remaining (45.2K tokens)
📊 Output: 12.8K tokens

💬 Recent:
> [user] fix the login bug
> [assistant] I found the issue in auth.ts...

[Stop] [Unlink]
```

**Data sources:**

| Field                     | Source                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project name + git branch | `execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"])` in session `cwd`                                                                                                                                                                                                                                                                        |
| Model + provider          | Primary: `model` field stored in session map at creation time. Fallback/update: `RequestTracker.getRequests()` last `phase: "end"` entry's `model` field (in case model changes mid-session). Provider name from `ConfigStore.getProvider(session.providerId)`.                                                                                  |
| Uptime                    | New `createdAt` timestamp stored in session map                                                                                                                                                                                                                                                                                                  |
| Activity state            | `SessionBridge.getSessionActivity(sessionId)` — returns granular state: idle, or last tool event (e.g. "Running: \`bun test\`", "Editing: \`src/auth.ts\`"). Includes staleness detection: if no event received for 30s while state is non-idle, falls back to "idle (stale)" to avoid showing stuck activity from crashed/broken event streams. |
| Context usage             | Last `context_usage` event's `usedTokens` + `remainingPct` — cached in SessionBridge as events flow through                                                                                                                                                                                                                                      |
| Cumulative output tokens  | Sum only `usage.outputTokens` from `RequestTracker.getRequests(sessionId)` where `phase === "end"` (input tokens overlap across requests so only context_usage is meaningful for input)                                                                                                                                                          |
| Recent conversation       | Ring buffer of last ~5 message summaries maintained in SessionBridge as events stream through (zero-cost read from memory). Truncated to fit within Telegram's 4096 char limit (see "Message length safety" below).                                                                                                                              |
| Action buttons            | `[Stop]` → `perm:stop:<sessionId>`, `[Unlink]` → `session:unlink:<sessionId>`. Unlink callback auto-responds with the `/chats` session list so user can immediately pick a new session instead of being left in limbo.                                                                                                                           |

**When no session is linked** — instead of just "No session linked", show a global snapshot:

```
No session linked.
3 active sessions: 2 idle, 1 working
Use /chats to connect.
```

### `/stop` — Richer feedback

**Before:**

```
Turn aborted.
```

**After:**

```
Stopped session in neovate-desktop-5.
Was: Running `bun test`
Session is now idle.
```

Uses the cached `SessionActivity` to confirm what was interrupted. Falls back to "Turn aborted." if no activity info is available.

### `/chats` — Enriched session list

**Before:**

```
Active sessions:
[neovate-desktop-5] [my-other-project]  ← just buttons
```

**After:**

```
Active sessions:

1. 🟢 Fix login bug ← linked
   neovate-desktop-5 · opus-4-6 · 23m

2. 🟡 Refactor auth middleware
   my-api · sonnet-4-6 · 1h 12m · Running: `bun test`

[Fix login bug] [Refactor auth middleware]
```

**State indicators:** 🟢 Idle, 🟡 Thinking/Working, 🔴 Error

**Linked indicator:** The session currently linked to this chat gets a `← linked` marker so the user knows which one they're already talking to. Uses `LinkStore.getSessionId(ref)` to check.

**Data per session:** Title, project name (last path segment), model (short name), uptime, activity state with current tool info.

Note: no git branch lookup here — only `/status` (single session) does that to avoid N subprocess spawns.

### `/repos` — Add git context

**Before:**

```
Projects:
[neovate-desktop-5] [my-api]
```

**After:**

```
Projects:

• neovate-desktop-5 — 2 active sessions
• my-api — 1 active session
• my-frontend — no active sessions

[neovate-desktop-5] [my-api] [my-frontend]
```

**Data:** Count of active sessions per project path. No git branch lookup (avoid N subprocesses for list views).

### `/start` — Richer welcome

Same enrichment as `/chats` for the session list portion. If no sessions, keep the current simple message.

### `/help` — Add brief descriptions

Minor formatting improvement — already adequate, just ensure descriptions stay in sync with enriched behavior.

## Implementation

### Files to modify

| File                             | Change                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `command-handler.ts`             | Add `RequestTracker`, `ConfigStore`, `SessionBridge`, `LinkStore` (for linked indicator), `maxMessageLength` to constructor. Enrich `handleStatus()`, `handleChats()`, `handleRepos()`, `handleStart()`, `handleStop()`. Add `gitBranch(cwd)` helper (async `execFile`). Add token helpers. Add message length truncation logic. `handleChats()`/`handleStart()` accept `ref` param to check linked session. |
| `remote-control-service.ts`      | Pass `RequestTracker`, `ConfigStore`, `SessionBridge` when constructing `CommandHandler`. Handle new callback actions (`session:unlink` — unlinks then auto-responds with `/chats` result).                                                                                                                                                                                                                  |
| `session-manager.ts`             | Store `createdAt: Date.now()` and `model` in session map entry during `initSession()`. Return both from `getActiveSessions()`.                                                                                                                                                                                                                                                                               |
| `shared/features/agent/types.ts` | Add `createdAt: number` and `model?: string` to `ActiveSessionInfo`.                                                                                                                                                                                                                                                                                                                                         |
| `session-bridge.ts`              | (1) `getSessionActivity(sessionId): SessionActivity` — returns granular state with last tool info + staleness detection (30s timeout). (2) Cache last `context_usage` event per session. (3) Maintain a ring buffer of last ~5 message summaries as events stream through.                                                                                                                                   |

### SessionBridge additions

```typescript
type SessionActivity = {
  state: "idle" | "thinking" | "tool";
  /** Present when state is "tool" — e.g. "Running: `bun test`", "Editing: `src/auth.ts`" */
  detail?: string;
  /** Timestamp of the last event that set this state. Used for staleness detection. */
  updatedAt: number;
};

type ContextUsage = {
  usedTokens: number;
  remainingPct: number;
  contextWindowSize: number;
};

type MessageSummary = {
  role: string;
  text: string; // truncated to ~150 chars
};

const ACTIVITY_STALE_MS = 30_000; // 30 seconds
```

- **Activity tracking:** On `tool_progress` / `tool_use_summary` events, cache the formatted string + `Date.now()` as current activity. On `result` event, clear it back to "idle". The `typingIntervals` map already tracks "thinking" state. `getSessionActivity()` checks `updatedAt` — if non-idle state is older than `ACTIVITY_STALE_MS`, return "idle" instead (prevents showing stuck activity from crashed/broken event streams).
- **Context usage:** On `context_usage` events (already flowing through), cache the latest `{ usedTokens, remainingPct, contextWindowSize }` per session.
- **Message ring buffer:** On text chunks (flush) and user messages, push a `{ role, text }` summary into a fixed-size array (5 entries). Read from memory on `/status` — no JSONL parsing.

### No new files, contracts, or dependencies

- Git branch: use `child_process.execFile` (already imported in session-manager) — only called for single-session `/status`, not list views
- Output token aggregation: sum only `outputTokens` from `RequestTracker.getRequests()` (input tokens overlap across requests; use `context_usage` for context fill instead)
- Activity state: granular tracking from existing event stream
- Recent messages: in-memory ring buffer, zero-cost reads

### Helper functions (in command-handler.ts)

```typescript
// Get git branch for a working directory (only used in /status, not list views)
async function gitBranch(cwd: string): Promise<string | null>;

// Sum cumulative output tokens from request tracker
function getCumulativeOutputTokens(requests: RequestSummary[]): number;

// Format uptime from createdAt timestamp
function formatUptime(createdAt: number): string; // "23m", "1h 12m", "2d 3h"

// Format token count with K/M suffix
function formatTokens(n: number): string; // "45.2K", "1.2M"

// Short model name (strip claude- prefix, etc.)
function shortModelName(model: string): string; // "opus-4-6", "sonnet-4-6"
```

### Message length safety

Command responses go through `adapter.sendMessage()` directly, not through `OutputBatcher` (which handles chunking). Telegram has a 4096 char limit. The enriched `/status` with recent messages and `/chats` with many sessions can exceed this.

**Strategy:** Build the response in sections with known priorities. Measure total length before sending. If over `adapter.maxMessageLength`, trim from the bottom:

1. Drop "Recent" section first (lowest priority)
2. Reduce session list entries (compact format: one line per session instead of two)
3. As a last resort, truncate with "..." and a hint to use a more specific command

This keeps the logic in `CommandHandler` — no changes to the adapter or batcher.

### Error handling

- Git branch lookup fails (not a git repo, git not installed): show path only, no branch
- No request data yet (fresh session): use model from session map (set at creation time); show "—" for tokens
- Context usage not yet received: omit the line entirely
- Message ring buffer empty: omit "Recent" section
