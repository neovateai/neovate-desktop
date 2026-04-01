# Fix Fork Session Pollution

## Problem

After rewind, old session `.jsonl` files persist on disk and reappear in the sidebar on app restart. Additionally, `forkSession()` appends " (fork)" to the title by default, which stacks on repeated rewinds (e.g. "hi (fork) (fork) (fork)").

## Fix 1: Pass explicit title to `forkSession()`

In `session-manager.ts:rewindToMessage()`, pass `title` to `forkSession()` using the original session's title:

```typescript
const result = await forkSession(sessionId, {
  upToMessageId: prevMessageId,
  dir: session.cwd,
  title: currentTitle, // preserve original title, no "(fork)" suffix
});
```

The title is passed from the renderer via the `rewindToMessage` contract input (the renderer already has it in the store). No extra SDK calls needed on the backend.

## Fix 2: Delete old session after rewind is finalized

Two deletion points:

- **Undo timeout/dismiss** (`onClose` in the undo toast): call `deleteSession(originalSessionId)` via the SDK to remove the `.jsonl` file from disk
- **File restore rewinds** (no undo window): delete immediately after the fork succeeds

Add a new oRPC method `deleteSessionFile` that calls the SDK's `deleteSession()` to remove the `.jsonl` file. The session is already closed in-memory by `closeSession()`.

## Files to Modify

| File                                                                   | Change                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/main/features/agent/session-manager.ts`                           | Pass `title` to `forkSession()`; add `deleteSessionFile()` method       |
| `src/shared/features/agent/contract.ts`                                | Add `deleteSessionFile` oRPC method                                     |
| `src/main/features/agent/router.ts`                                    | Wire `deleteSessionFile`                                                |
| `src/renderer/src/features/agent/components/message-rewind-button.tsx` | Call `deleteSessionFile` on undo timeout and after file-restore rewinds |
