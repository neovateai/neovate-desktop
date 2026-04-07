# Remote Prompt Visibility in Desktop UI

**Date:** 2026-04-07
**Status:** Approved, not yet implemented

## Problem

When a user sends a prompt from Telegram via Remote Control, the AI processes it and the response appears in both Telegram and the desktop chat. However, the **user prompt itself never appears in the desktop UI** — the chat shows the AI response with no visible input.

### Root Cause

When a user types locally, `ClaudeCodeChat._sendMessage()` calls `this.#state.pushMessage(uiMessage)` to add the user bubble to the renderer's message state before sending to the main process. It also calls `useAgentStore.getState().addUserMessage()` to update the sidebar (title, preview, session list). When Telegram sends a prompt, `SessionBridge.sendToSession()` calls `SessionManager.send()` directly — the SDK processes the message and streams assistant events back to the renderer, but neither the chat state nor the agent store is updated with the user message.

## Approach

Publish external user messages through the existing `eventPublisher` so the renderer can display them inline in the chat with a subtle platform badge, and update the agent store for sidebar consistency.

## Design

### 1. Data Model Changes

**`src/shared/claude-code/types.ts`**

Add a new event kind to `ClaudeCodeUIEvent`:

```typescript
export type ClaudeCodeUIEvent =
  | { kind: "event"; event: ClaudeCodeUIEventMessage }
  | { kind: "request"; requestId: string; request: ClaudeCodeUIEventRequest }
  | { kind: "request_settled"; requestId: string }
  | { kind: "chunk"; chunk: ClaudeCodeUIMessageChunk }
  | { kind: "user_message"; message: ClaudeCodeUIMessage }; // NEW
```

Extend message `Metadata` with optional source:

```typescript
type Metadata = {
  deliveryMode?: "stream" | "restored";
  sessionId: string;
  parentToolUseId: string | null;
  source?: { platform: string }; // NEW — absent means local
};
```

> **Note:** `src/shared/features/remote-control/types.ts` already defines a `MessageSource` type with `{ platform, sender }`. We keep the `Metadata.source` field minimal (`{ platform }` only) to avoid leaking sender identity into the renderer's generic message layer. `MessageSource` remains available for remote-control-specific code that needs the full context.

### 2. Main Process — Emit user message on external send

**`src/main/features/agent/session-manager.ts`**

Add an optional `options` parameter to `send()`. SessionManager is platform-agnostic — it receives source metadata from the caller rather than fabricating it.

**Critical**: The `eventPublisher.publish()` call MUST go before `session.input.push()` to ensure the renderer receives the user message event before the SDK starts processing and emitting assistant chunks.

```typescript
async send(
  sessionId: string,
  message: ClaudeCodeUIMessage,
  options?: { source?: { platform: string } },
): Promise<void> {
  // ... existing logic (extract text, images, git snapshot, message ID tracking) ...

  // NEW: if source is provided, publish the user message so renderer can display it.
  // Must happen BEFORE session.input.push() to maintain ordering (see Ordering Invariant).
  if (options?.source) {
    this.eventPublisher.publish(sessionId, {
      kind: "user_message",
      message: {
        ...message,
        metadata: {
          sessionId,
          parentToolUseId: null,
          source: options.source,
        },
      },
    });
  }

  this.requestTracker.startTurn(sessionId);
  this.powerBlocker.onTurnStart(sessionId);
  session.input.push({
    type: "user",
    message: { role: "user", content },
    parent_tool_use_id: null,
    session_id: sessionId,
    uuid: userMessageId,
  });
}
```

**`src/main/features/remote-control/session-bridge.ts`**

Pass the platform from the inbound message's `ref.platformId`:

```typescript
async sendToSession(sessionId: string, msg: InboundMessage): Promise<void> {
  const uiMessage = {
    id: randomUUID(),
    role: "user" as const,
    parts: [{ type: "text" as const, text: msg.text }],
    createdAt: new Date(),
  };
  await this.sessionManager.send(sessionId, uiMessage, {
    source: { platform: msg.ref.platformId },
  });
  this.pushMessage(sessionId, "user", msg.text);
  log("sent message to session %s", sessionId);
}
```

This works automatically for any future platform adapter (Discord, Slack, etc.) — the `platformId` is set by each adapter.

### 3. Renderer — Handle the new event

**`src/renderer/src/features/agent/chat.ts`**

Add a case in `#handleMessage()`:

```typescript
async #handleMessage(message: ClaudeCodeUIEvent) {
  // NEW: external user messages — push into chat state + update agent store
  if (message.kind === "user_message") {
    this.#state.pushMessage(message.message);

    // Update agent store (sidebar title, preview, session list) — mirrors
    // the addUserMessage() call in agent-chat.tsx handleSend().
    const text = message.message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (text) {
      useAgentStore.getState().addUserMessage(this.id, text);
    }
    return;
  }
  // ... existing handlers ...
}
```

This ensures that when a remote prompt arrives:

- The user bubble appears in the chat view (`pushMessage`)
- The session title is set from the first message content
- The sidebar preview updates
- The session is surfaced in the session list if it was new

### 4. Renderer — Visual badge for remote messages

**`src/renderer/src/features/agent/components/message-parts.tsx`**

In the user text rendering block, add a small platform indicator. The badge is gated on `isLastText` (matching existing `canShowUserActions` pattern) to avoid duplication on multi-part messages. The platform name is capitalized since `platformId` is a lowercase internal ID (e.g., `"telegram"` → `"Telegram"`).

```tsx
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Inside the "text" case, after the existing canShowUserActions declaration:
const remoteSource = isLastText ? message.metadata?.source : undefined;

return (
  <Message from={message.role}>
    <MessageContent>
      {message.role === "assistant" ? (
        <MessageResponse ...>{part.text}</MessageResponse>
      ) : (
        <p className="m-0 whitespace-pre-wrap">{part.text}</p>
      )}
    </MessageContent>
    {remoteSource && (
      <span className="mt-1 ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
        <Send className="size-2.5" />
        {capitalize(remoteSource.platform)}
      </span>
    )}
    {canShowUserActions && (
      <MessageActions className="mt-1 ml-auto">
        <MessageRewindButton ... />
      </MessageActions>
    )}
  </Message>
);
```

The badge is tiny, right-aligned, below the user bubble — consistent with the quiet/minimal design language.

### 5. No Telegram echo (constraint #2)

The `SessionBridge.subscribeSession()` event loop only handles `chunk`, `event`, and `request` event kinds. The new `user_message` kind is not matched, so it is silently ignored by the bridge and never echoed back to Telegram.

## Files Changed

| File                                                           | Change                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/shared/claude-code/types.ts`                              | Add `user_message` kind to `ClaudeCodeUIEvent`; add `source?` to `Metadata`                 |
| `src/main/features/agent/session-manager.ts`                   | Add `options?: { source?: { platform: string } }` to `send()`, publish `user_message` event |
| `src/main/features/remote-control/session-bridge.ts`           | Pass `{ source: { platform: msg.ref.platformId } }` to `sessionManager.send()`              |
| `src/renderer/src/features/agent/chat.ts`                      | Handle `user_message` event in `#handleMessage()`, call `addUserMessage` on agent store     |
| `src/renderer/src/features/agent/components/message-parts.tsx` | Render platform badge on user messages with `source` metadata                               |

## Known Limitations

1. **Badge lost when session is not focused**: If the user is viewing a different session when the Telegram prompt arrives, no `ClaudeCodeChat` instance is subscribed to the target session. The `user_message` event is emitted and dropped. The message text is preserved via SDK persistence, but the badge is lost even within the same app session (not just after restart). When the user switches to that session, the message appears via restore without the badge.

2. **Badge lost on session restore**: `sessionMessagesToUIMessages()` reconstructs user messages from SDK storage with hardcoded metadata — the `source` field is not preserved in the SDK's `SessionMessage` format.

3. **Future fix for both**: Add a side-table in `LinkStore` mapping message IDs to their source platform. On restore or session focus, look up the side-table to rehydrate `source` metadata.

## Ordering Invariant

`eventPublisher.publish()` is called before `session.input.push()` in `SessionManager.send()`. This ensures the renderer receives the user message event before the SDK begins processing and emitting assistant chunks — maintaining correct visual ordering in the chat.

## Estimated Scope

~40 lines of new code across 5 files. No new dependencies.
