# chat.message.sent Tracking

Extends the [renderer analytics design](2026-04-07-renderer-analytics-design.md) to track `chat.message.sent` across all send paths.

## 1. Problem

`chat.message.sent` is tracked via `data-track-id` on the send button, which only fires on click. Messages sent via Enter, Cmd+Enter, popup window (Alt+N), or remote control are never tracked.

## 2. Architecture

`ClaudeCodeChat._sendMessage` is the single exit point for all message sends. It dispatches a `CustomEvent` carrying the full `sendMessage` parameters. The analytics layer listens independently — chat code has no analytics dependency.

```
Callers (zero changes)           Chat layer                      Analytics layer
──────────────────────           ──────────                       ───────────────
agent-chat.tsx     ──┐           chat.ts                          data-track.ts
popup-window.tsx   ──┼─ sendMessage() → _sendMessage()              initMessageSentTracking()
chat-manager.ts    ──┘                │                               └─ addEventListener("neovate:message-sent")
                                      └─ dispatch CustomEvent("neovate:message-sent")
                                           detail: { metadata }           │
                                                                          └─ analytics.track("chat.message.sent", metadata)
```

### Event payload

The `CustomEvent` detail mirrors the `sendMessage` parameter structure. Currently only `metadata` is included; additional fields can be added without changing the listener.

```typescript
window.dispatchEvent(
  new CustomEvent("neovate:message-sent", {
    detail: { metadata: message?.metadata },
  }),
);
```

### Listener

The listener extracts `metadata` as a single field and passes it through to `analytics.track`:

```typescript
export function initMessageSentTracking(analytics: AnalyticsInstance): () => void {
  const handler = (e: Event) => {
    const { metadata } = (e as CustomEvent<{ metadata?: Metadata }>).detail;
    analytics.track("chat.message.sent", { metadata, trackType: "programmatic" });
  };
  window.addEventListener("neovate:message-sent", handler);
  return () => window.removeEventListener("neovate:message-sent", handler);
}
```

### Source distinction

The existing `Metadata.source?: { platform: string }` field distinguishes remote control messages (Telegram, WeChat, etc.) from UI-initiated messages. Messages without `source` are UI-initiated. Further distinction (main window vs popup) is handled at the data analysis layer.

## 3. Send Paths

| Path                                     | File                                                | `metadata.source`     |
| ---------------------------------------- | --------------------------------------------------- | --------------------- |
| Main window (button/Enter/Cmd+Enter)     | `agent-chat.tsx` → `MessageInput` → `sendMessage`   | absent                |
| Popup window (Alt+N)                     | `popup-window.tsx` → `MessageInput` → `sendMessage` | absent                |
| Remote control (context clear auto-send) | `chat-manager.ts` → `sendMessage`                   | `{ platform: "..." }` |

All paths converge at `_sendMessage` — no per-path tracking code needed.

## 4. Changes

### `src/renderer/src/features/agent/chat.ts`

Dispatch event after message is pushed to state, before `transport.send`:

```typescript
// after pushMessage/replaceMessage, before this.#state.status = "submitted"
window.dispatchEvent(
  new CustomEvent("neovate:message-sent", {
    detail: { metadata: message?.metadata },
  }),
);
```

### `src/renderer/src/features/analytics/data-track.ts`

Add `initMessageSentTracking(analytics)` — listens for `neovate:message-sent`, passes metadata through to `analytics.track`.

### `src/renderer/src/core/app.tsx`

Register `initMessageSentTracking` alongside `initClickTracking`.

### Cleanup

- Remove `data-track-id="chat.message.sent"` from send button in `input-toolbar.tsx`
- Remove analytics wrapper from `message-input.tsx` (restore plain `onSend` prop)
- Remove `analytics/emit.ts` (no longer needed)

## 5. Decision Log

**1. Where to dispatch the event?**

- Options: A) Each call site dispatches · B) `_sendMessage` dispatches · C) `onMessageSent` callback on ChatInit
- Decision: **B)** — `_sendMessage` is the single exit point for all sends. Dispatching here covers every path automatically with zero caller changes.

**2. Where to listen?**

- Options: A) `data-track.ts` with `initMessageSentTracking` · B) `chat-manager.ts` callback
- Decision: **A)** — Keeps analytics logic in the analytics module. `chat-manager` is a module-level singleton without access to the analytics instance.

**3. Event payload: transform or passthrough?**

- Options: A) Derive `source: "main" | "popup" | "remote-control"` in listener · B) Pass `metadata` as a single field
- Decision: **B)** — Keep `metadata` as one field (`{ metadata, trackType }`), not destructured. `metadata.source` already distinguishes remote control from UI. Further breakdown (main vs popup) belongs in the data analysis layer, not the collection layer.

**4. Should `chat.ts` know about analytics?**

- No. It dispatches a generic domain event (`neovate:message-sent`), consistent with existing patterns (`neovate:turn-completed`, `neovate:focus-input`). The analytics layer subscribes independently.
