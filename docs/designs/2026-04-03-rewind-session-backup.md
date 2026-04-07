# Rewind Session Backup

## Overview

When a rewind operation finalizes (undo timeout expires, file-restore rewind, or double-rewind), the original session's `.jsonl` transcript is deleted. This design adds a backup step before deletion, copying the transcript to `~/.neovate-desktop/rewind-history/` to prevent data loss and support a future timeline/branching UI.

## Design Decisions

- **Approach**: Single atomic `archiveSessionFile()` method in SessionManager that backs up then deletes in one call. Avoids race conditions between separate backup/delete IPC calls.
- **Retention**: Unlimited. Every rewind creates a new backup. No auto-pruning.
- **Error handling**: Archive is best-effort (fire-and-forget with `.catch()`). If backup fails, the original `.jsonl` is preserved — delete only runs after backup succeeds.

## Directory Structure

```
~/.neovate-desktop/rewind-history/
  └── <sessionId>/
      ├── 2026-04-03T10-30-45-123Z.jsonl      # backup of the .jsonl transcript
      └── 2026-04-03T10-30-45-123Z.meta.json   # fork context metadata
```

Timestamp uses filesystem-safe format (hyphens instead of colons). The sessionId directory groups all backups from the same session lineage. The `.meta.json` gives a future timeline UI everything it needs to reconstruct the branch tree.

### meta.json Schema

```json
{
  "originalSessionId": "abc-123",
  "forkedSessionId": "def-456",
  "rewindMessageId": "msg-789",
  "restoreFiles": true,
  "title": "Fix authentication bug",
  "cwd": "/Users/me/project",
  "backedUpAt": "2026-04-03T10:30:45.123Z"
}
```

## Backend Changes

### session-manager.ts

Replace `deleteSessionFile()` usage with a new `archiveSessionFile()` that atomically backs up then deletes:

```typescript
async archiveSessionFile(
  sessionId: string,
  meta: {
    forkedSessionId: string;
    rewindMessageId: string;
    restoreFiles: boolean;
    title?: string;
    cwd?: string;
  },
): Promise<void> {
  const matches = listSessionFiles(`${sessionId}.jsonl`);
  if (matches.length === 0) {
    log("archiveSessionFile: no file found for sessionId=%s", sessionId);
    return;
  }

  // 1. Backup
  const backupDir = path.join(APP_DATA_DIR, "rewind-history", sessionId);
  await mkdir(backupDir, { recursive: true });

  const now = new Date();
  const timestamp = now.toISOString().replace(/:/g, "-").replace(/\./g, "-");

  await copyFile(matches[0], path.join(backupDir, `${timestamp}.jsonl`));

  const metaJson = JSON.stringify({
    originalSessionId: sessionId,
    forkedSessionId: meta.forkedSessionId,
    rewindMessageId: meta.rewindMessageId,
    restoreFiles: meta.restoreFiles,
    title: meta.title,
    cwd: meta.cwd,
    backedUpAt: now.toISOString(),
  }, null, 2);
  await writeFile(path.join(backupDir, `${timestamp}.meta.json`), metaJson, "utf-8");

  log("archiveSessionFile: backed up sessionId=%s to %s", sessionId, backupDir);

  // 2. Delete original (only after backup succeeds)
  for (const file of matches) {
    try {
      await unlink(file);
      log("archiveSessionFile: deleted %s", file);
    } catch (error) {
      log(
        "archiveSessionFile: failed to delete %s error=%s",
        file,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
```

Requires adding `copyFile`, `mkdir`, `writeFile` from `node:fs/promises` imports (existing `unlink` import can be reused from `deleteSessionFile`).

`deleteSessionFile()` remains for non-rewind deletions (e.g. user manually deletes a session).

### contract.ts

New oRPC method on the agent contract:

```typescript
archiveSessionFile: oc.input(z.object({
  sessionId: z.string(),
  forkedSessionId: z.string(),
  rewindMessageId: z.string(),
  restoreFiles: z.boolean(),
  title: z.string().optional(),
  cwd: z.string().optional(),
})).output(type<void>()),
```

### router.ts

Wire the new contract method:

```typescript
archiveSessionFile: os.agent.archiveSessionFile.handler(async ({ input, context }) => {
  agentLog("archiveSessionFile: sessionId=%s", input.sessionId);
  await context.sessionManager.archiveSessionFile(input.sessionId, {
    forkedSessionId: input.forkedSessionId,
    rewindMessageId: input.rewindMessageId,
    restoreFiles: input.restoreFiles,
    title: input.title,
    cwd: input.cwd,
  });
}),
```

## Frontend Changes

### message-rewind-button.tsx

Extract a helper to replace the duplicated backup+delete pattern across three call sites:

```typescript
function archiveOriginalSession(
  sessionId: string,
  meta: {
    forkedSessionId: string;
    rewindMessageId: string;
    restoreFiles: boolean;
    title?: string;
    cwd?: string;
  },
) {
  import("../../../orpc").then(({ client }) => {
    client.agent.archiveSessionFile({ sessionId, ...meta }).catch(() => {});
  });
}
```

Then replace `deleteSessionFile` calls in three places:

**1. Double-rewind finalization (~line 113-119):**

```typescript
if (store.rewindUndoBuffer) {
  await claudeCodeChatManager.disposeChat(store.rewindUndoBuffer.originalSessionId);
  const orig = store.sessions.get(store.rewindUndoBuffer.originalSessionId);
  archiveOriginalSession(store.rewindUndoBuffer.originalSessionId, {
    forkedSessionId: store.rewindUndoBuffer.forkedSessionId,
    rewindMessageId: messageId,
    restoreFiles,
    title: orig?.title,
    cwd: orig?.cwd,
  });
  store.setRewindUndoBuffer(null);
}
```

**2. Undo toast dismiss / timeout (~line 184-193):**

```typescript
onClose: async () => {
  const buf = useAgentStore.getState().rewindUndoBuffer;
  if (buf && buf.originalSessionId === sessionId) {
    claudeCodeChatManager.disposeChat(sessionId);
    archiveOriginalSession(sessionId, {
      forkedSessionId: result.forkedSessionId,
      rewindMessageId: messageId,
      restoreFiles: false,
      title: original?.title,
      cwd: original?.cwd,
    });
    useAgentStore.getState().setRewindUndoBuffer(null);
  }
},
```

**3. File-restore rewind (~line 196-199):**

```typescript
} else {
  archiveOriginalSession(sessionId, {
    forkedSessionId: result.forkedSessionId,
    rewindMessageId: messageId,
    restoreFiles: true,
    title: original?.title,
    cwd: original?.cwd,
  });
}
```

## Files to Modify

| File                                                                   | Change                                                                             |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/main/features/agent/session-manager.ts`                           | Add `archiveSessionFile()` method; add `copyFile`, `mkdir`, `writeFile` imports    |
| `src/shared/features/agent/contract.ts`                                | Add `archiveSessionFile` oRPC method                                               |
| `src/main/features/agent/router.ts`                                    | Wire `archiveSessionFile` handler                                                  |
| `src/renderer/src/features/agent/components/message-rewind-button.tsx` | Add `archiveOriginalSession` helper; replace `deleteSessionFile` calls in 3 places |

No new files. No store changes. No new dependencies.

## Intentionally Deferred

- **Timeline UI** — backups accumulate on disk with metadata; future feature reads them
- **Pruning / disk management** — unlimited for now; add settings-based retention later if needed
- **Restore from backup** — no UI to browse or restore from backups yet
