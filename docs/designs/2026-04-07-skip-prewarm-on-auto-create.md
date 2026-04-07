# Skip Pre-warm on Auto-created Sessions

## Problem

On startup, the app creates two Claude Code sessions for one project:

1. **Active session** (`effect[auto-create]` in `agent-chat.tsx:179`) — auto-created when a project becomes active with no existing session
2. **Background session** (`preWarmForProject` in `agent-chat.tsx:183`) — pre-warmed immediately after in the `.then()` callback

The second session is wasteful because the auto-created session is itself brand new and unused (`isNew: true`). Pre-warming a replacement makes no sense until the user actually uses the first one.

## Evidence from dev.log

```
13:21:36.355  effect[auto-create]: creating new session for playground
13:21:36.503  claudeCode.createSession → cba22964
13:21:39.743  preWarmForProject: creating background session → db4d5742
13:21:47.414  closing 2 sessions  ← both alive at quit
```

## Fix

Remove the `preWarmForProject` call at `agent-chat.tsx:183` (lines 182-183):

```typescript
// Before
createNewSession(activeProjectPath).then((sessionId) => {
  chatLog("effect[auto-create]: session created sessionId=%s", sessionId);
  // Eagerly pre-warm a background session so the first "New Chat" is instant
  claudeCodeChatManager.preWarmForProject(activeProjectPath);
});

// After
createNewSession(activeProjectPath).then((sessionId) => {
  chatLog("effect[auto-create]: session created sessionId=%s", sessionId);
  // Don't pre-warm here — this session is itself unused. Pre-warm triggers on first message send.
});
```

## Why this is safe

Pre-warming is already triggered at the right moments elsewhere:

| Call site                 | When                                  | Still needed                                      |
| ------------------------- | ------------------------------------- | ------------------------------------------------- |
| `agent-chat.tsx:215`      | User sends first message (handleSend) | Yes — session is now "used", pre-warm replacement |
| `chat-manager.ts:176`     | After `invalidateNewSessions`         | Yes — sessions were just purged                   |
| `project/store.ts:86,100` | On project add/switch                 | Yes — need warm session for new project           |
| **`agent-chat.tsx:183`**  | **After auto-create on startup**      | **No — remove this**                              |

The `handleSend` call (line 215) is the correct place: it fires when the user actually commits to using the auto-created session, making a replacement pre-warm worthwhile.

## Note: blind spot in `preWarmForProject` guard

The guard at `chat-manager.ts:185-188` checks for existing pre-warmed sessions but explicitly excludes the active session:

```typescript
const existing = findPreWarmedSession(cwd);
if (existing && existing !== useAgentStore.getState().activeSessionId) {
  log("preWarmForProject: already have a background pre-warmed session, skipping");
  return;
}
```

So even though the active auto-created session is `isNew: true` (effectively pre-warmed), the guard doesn't catch it. The guard was designed for "is there a background spare?" not "does the user already have an unused session?". Removing the call site is simpler and sufficient for now, but if this pattern recurs, making `preWarmForProject` itself check whether the active session is still unused would be a defense-in-depth improvement.
