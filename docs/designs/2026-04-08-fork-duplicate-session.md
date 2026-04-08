# Fork/Duplicate Session

**Date:** 2026-04-08
**Status:** Design approved, not yet implemented

## Summary

Add a "Fork" action to the session list context menu (both right-click and `...` dropdown). Forking creates a new session containing all conversation history, allowing the user to branch off in a new direction while preserving the original.

## Requirements

- **Scope:** Fork from latest message (full history copy, branch point at end)
- **Activation:** Automatically switch to the forked session
- **Original:** Keep both sessions — original is untouched
- **Naming:** `"<original title> (Fork)"`, or `"(Fork)"` if untitled
- **Pinned:** If the original session is pinned, the forked session is also pinned
- **Disabled when:** Session is new (no messages yet), or session is actively streaming

## Approach

Reuse the SDK's standalone `forkSession()` function (already used by the rewind feature) but without file restoration. Add a clean oRPC method to expose it independently from rewind.

### 1. Contract (`src/shared/features/agent/contract.ts`)

New method. The renderer passes `cwd` and `title` so the main process doesn't need to reverse-engineer them from the JSONL file path:

```ts
forkSession: oc.input(
  z.object({
    sessionId: z.string(),
    cwd: z.string(),
    title: z.string().optional(),
  }),
).output(
  z.object({
    forkedSessionId: z.string(),
    originalSessionId: z.string(),
  }),
);
```

### 2. Session Manager (`src/main/features/agent/session-manager.ts`)

New method `forkSession(sessionId, cwd, title?)`:

Since `cwd` and `title` come from the renderer, the logic is the same for both active and persisted sessions:

1. Compute fork title: `title ? \`${title} (Fork)\` : "(Fork)"`
2. Call standalone `forkSession(sessionId, { dir: cwd, title: forkTitle })`
   - **Note:** Check at implementation time whether `upToMessageId` can be omitted to fork the entire session. If yes, skip step 3. If not, fall through to step 3.
3. _(Only if SDK requires `upToMessageId`)_: For active sessions, read last ID from `uiToSdkMessageIds`. For persisted sessions, call `getSessionMessages(sessionId)` and take the last entry's ID.
4. **Do not** close or archive the original session
5. Emit a `SessionLifecycleEvent` with `type: "created"` for the fork so other windows see it
6. Return `{ forkedSessionId, originalSessionId }`

**Note:** `forkSession` is imported as a standalone function from `@anthropic-ai/claude-agent-sdk` (not a method on the Query object). See `rewindToMessage` at line ~934 for the existing pattern.

**Edge cases:**

- Reject fork if session has no messages (nothing to fork)
- Streaming guard is enforced in the UI (disable button); no server-side check needed

### 3. Router (`src/main/features/agent/router.ts`)

Wire `forkSession` contract → `sessionManager.forkSession()`.

### 4. Chat Manager (`src/renderer/src/features/agent/chat-manager.ts`)

New method `forkSession(sessionId, cwd, title?)`:

1. Call `rpc.claudeCode.forkSession({ sessionId, cwd, title })`
2. Call `loadSession(forkedSessionId, cwd)` to hydrate the fork
3. Return forked session data (messages, capabilities, etc.)

### 5. Store (`src/renderer/src/features/agent/store.ts`)

New action `forkSession(originalSessionId)`:

1. Set a loading flag (reuse existing `restoring` pattern used when loading persisted sessions) so the UI can show a loading indicator
2. Resolve `cwd` and `title` from the session's `ChatSession` or `SessionInfo`
3. Call `chatManager.forkSession(originalSessionId, cwd, title)`
4. Register the forked session in `sessions` map via existing `registerSessionInStore()`
5. If the original session was pinned, pin the forked session via `togglePinSession(projectPath, forkedSessionId)`
6. Set `activeSessionId` to the forked session
7. Clear loading flag
8. Original session remains in `sessions` and `agentSessions`

### 6. Context Menu (`src/renderer/src/features/agent/components/session-actions-menu.tsx`)

Add **"Fork"** menu item to **both** the `variant="context"` (right-click) and `variant="dropdown"` (`...` button) menus — following the same pattern as all other actions:

- **Position:** After "Archive", before the separator
- **Label:** `t("session.fork")`
- **Disabled:** When `isNew` is true, or when session is streaming
- **Action:** Calls the store's `forkSession()` action

```
Rename
Pin / Unpin
Archive
Fork              ← new
───────────────
Copy Working Directory
Copy Session ID
Copy JSONL Path
Copy Claude Code Resume Command
Copy Deeplink
```

### 7. i18n

Add to locale files:

```json
"session.fork": "Fork"
```

## Implementation notes

- Check whether the SDK's `forkSession()` supports omitting `upToMessageId` to fork the entire session. If yes, the implementation simplifies significantly — no need to resolve the last message ID at all.
- `forkSession` is a standalone import from `@anthropic-ai/claude-agent-sdk`, not a Query method.

## Non-goals

- No "undo fork" mechanism (unlike rewind, both sessions persist)
- No file restoration (fork is conversation-only)
- No fork-from-specific-message (that's what rewind already does)
