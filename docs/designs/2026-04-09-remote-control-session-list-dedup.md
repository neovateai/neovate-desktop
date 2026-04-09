# Improve Remote Control: Dedup, Capability Flag, Auto-link, Bug Fix

## Problem

When `/chats` (or `/start`) is invoked in DingTalk or WeChat, the user sees the session list twice:

1. The formatted numbered list from `CommandHandler.handleChats()` in the `text` field
2. A second numbered list appended by the adapter's `sendMessage()` from `inlineActions`

Telegram doesn't have this problem because it renders `inlineActions` as native inline keyboard buttons.

### Example (current)

```
Active sessions:
1. 🟢 workspaces/playground
   playground · anthropic/claude-haiku-4.5 · 0m
2. 🟢 Projects/cc-skills
   cc-skills · default · 0m

1. workspaces/playground
2. Projects/cc-skills
Reply with a number to select.
```

---

## Change 1: Capability flag + centralized `sendWithActions()` helper

### Why not just fix it in `onMessage()`?

There are 6+ call sites in `remote-control-service.ts` that pass `inlineActions` to `adapter.sendMessage()`:

- `onMessage()` line 417 — CommandResult from commands
- `handleSessionCallback("unlink")` line 494 — synthesized `/chats` after unlink
- `handleProjectCallback("select")` line 570 — session list for a project (text is just a header, labels like `Session abc12345` are NOT in the text)
- `handleProjectCallback("select")` line 582 — no-sessions "Create one?" with action
- Any future call site

Fixing only `onMessage()` would **regress** `handleProjectCallback("select")` — the adapter would no longer render the session list since its list-rendering code is removed.

### Solution: `sendWithActions()` helper

Add `supportsInlineKeyboard` to the adapter interface, then route ALL action-bearing messages through one helper.

### File: `src/main/features/remote-control/platforms/types.ts`

```ts
export interface RemoteControlPlatformAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly maxMessageLength: number;
  readonly supportsEditing: boolean;
  readonly supportsInlineKeyboard: boolean; // NEW
  // ...
}
```

| Adapter  | `supportsInlineKeyboard` |
| -------- | ------------------------ |
| Telegram | `true`                   |
| DingTalk | `false`                  |
| WeChat   | `false`                  |

### File: `src/main/features/remote-control/remote-control-service.ts`

Add a private helper and use it everywhere:

```ts
/**
 * Send a message with optional inline actions, adapting to platform capabilities.
 *
 * @param actionsInText - Set `true` when the caller has already rendered
 *   the actions as a numbered list inside `text` (e.g. /chats, /start).
 *   When false (default), text-only adapters will append the list.
 *   Keyboard-capable adapters always use native buttons regardless.
 */
private async sendWithActions(
  adapter: RemoteControlPlatformAdapter,
  ref: ConversationRef,
  text: string,
  actions?: InlineAction[],
  actionsInText = false,
): Promise<void> {
  if (!actions?.length) {
    await adapter.sendMessage({ ref, text });
    return;
  }
  if (adapter.supportsInlineKeyboard) {
    await adapter.sendMessage({ ref, text, inlineActions: actions });
    return;
  }
  // Text-only platform: append numbered list only if caller didn't already render it
  if (!actionsInText) {
    const list = actions.map((a, i) => `${i + 1}. ${a.label}`).join("\n");
    text = `${text}\n\n${list}`;
  }
  text = `${text}\n\nReply with a number to select.`;
  await adapter.sendMessage({ ref, text, inlineActions: actions });
}
```

**Why explicit `actionsInText` instead of a label-matching heuristic?** A heuristic like `actions.every(a => text.includes(a.label))` has false-positive risk — a session titled `"test"` would match if the text contains the word "test" anywhere. Short or common labels break it. The caller always knows whether it rendered the list, so just declare it.

### Replace all call sites

Every `adapter.sendMessage({ ref, text, inlineActions })` call in `remote-control-service.ts` becomes `this.sendWithActions(...)`. Plain text messages (no actions) can stay as direct `adapter.sendMessage()` calls.

Call sites to update:

| Location                                                                         | `actionsInText`   | Why                                                                   |
| -------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------- |
| `onMessage()` line 417 — CommandResult from `/chats`, `/start`, `/repos`, `/new` | `true`            | `formatSessionList` / command text already contains the list          |
| `handleSessionCallback("unlink")` line 494 — injected `/chats` result            | `true`            | Text includes the `/chats` output with session names                  |
| `handleProjectCallback("select")` line 570 — "Sessions in /path:"                | `false` (default) | Text is just a header, labels like `Session abc12345` are NOT in text |
| `handleProjectCallback("select")` line 582 — "Create one?"                       | `false` (default) | Text is just a prompt                                                 |

### DingTalk/WeChat adapters: remove list rendering from `sendMessage()`

Both adapters only need to store `pendingActions` — the service layer handles text rendering:

```ts
// Before
if (msg.inlineActions?.length) {
  const list = msg.inlineActions.map((a, i) => `${i + 1}. ${a.label}`).join("\n");
  text = `${text}\n\n${list}\n\nReply with a number to select.`;
  this.pendingActions.set(msg.ref.chatId, msg.inlineActions);
}

// After
if (msg.inlineActions?.length) {
  this.pendingActions.set(msg.ref.chatId, msg.inlineActions);
}
```

### Expected results

**`/chats` — labels in text, list skipped:**

```
Active sessions:
1. 🟢 workspaces/playground
   playground · anthropic/claude-haiku-4.5 · 0m
2. 🟢 Projects/cc-skills
   cc-skills · default · 0m

Reply with a number to select.
```

**`handleProjectCallback("select")` — labels NOT in text, list appended:**

```
Sessions in /Users/foo/project:

1. Session abc12345
2. Session def67890
3. New session

Reply with a number to select.
```

---

## Change 2: Auto-link when only 1 active session

When a user sends a non-command message with no linked session and there's exactly 1 active session, auto-link silently and forward the message. No notification — the session's response makes the link obvious.

### File: `src/main/features/remote-control/remote-control-service.ts`

In `onMessage()`, replace the "no session linked" block:

```ts
// Current
const sessionId = this.linkStore.getSessionId(msg.ref);
if (!sessionId) {
  await adapter.sendMessage({
    ref: msg.ref,
    text: "No active session linked to this chat. Use /chats to pick one.",
  });
  return;
}

// New
let sessionId = this.linkStore.getSessionId(msg.ref);
if (!sessionId) {
  const activeSessions = this.sessionManager.getActiveSessions();
  if (activeSessions.length === 1) {
    // Auto-link the only active session and forward silently
    const only = activeSessions[0];
    sessionId = only.sessionId;
    this.linkStore.save(msg.ref, sessionId);
    this.bridge.subscribeSession(sessionId, msg.ref, adapter);
    // Fall through to forward the message to the session
  } else {
    const hint =
      activeSessions.length === 0
        ? "No active sessions. Use /new to create one."
        : `${activeSessions.length} sessions available. Use /chats to pick one.`;
    await adapter.sendMessage({ ref: msg.ref, text: hint });
    return;
  }
}
```

No race condition — `bridge.subscribeSession()` is synchronous (sets up an AbortController and starts a fire-and-forget async iteration loop). The subscription is ready before `bridge.sendToSession()` runs.

---

## Change 3: Fix `/start` string literal bug

### File: `src/main/features/remote-control/command-handler.ts`, line 75

```ts
// Bug: regular quotes, ${APP_NAME} is not interpolated — user sees literal "${APP_NAME}"
text: "Welcome to ${APP_NAME}! No active sessions. Use /new to create one, or /repos to browse projects.",

// Fix: backticks
text: `Welcome to ${APP_NAME}! No active sessions. Use /new to create one, or /repos to browse projects.`,
```

---

## Summary of files changed

| File                          | Change                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `platforms/types.ts`          | Add `supportsInlineKeyboard` to adapter interface                                              |
| `platforms/telegram/index.ts` | Add `supportsInlineKeyboard = true`                                                            |
| `platforms/dingtalk/index.ts` | Add `supportsInlineKeyboard = false`, remove list rendering from `sendMessage()`               |
| `platforms/wechat/index.ts`   | Add `supportsInlineKeyboard = false`, remove list rendering from `sendMessage()`               |
| `remote-control-service.ts`   | Add `sendWithActions()` helper, update all action-bearing call sites, auto-link single session |
| `command-handler.ts`          | Fix string literal on line 75                                                                  |
