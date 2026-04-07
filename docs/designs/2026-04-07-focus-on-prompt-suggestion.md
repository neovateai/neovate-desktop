# Focus Message Input on Prompt Suggestion Arrival

## Problem

When the agent finishes a turn and emits a `prompt_suggestion`, the message input placeholder updates to show the suggestion text with "Tab to fill / Enter to send" hints. However, the editor is **not focused** — if the user clicked elsewhere (sidebar, scrolled messages, etc.), Tab/Enter won't work until they manually click back into the input.

## Decision

- **Trigger:** One-time focus when a new `promptSuggestion` arrives (not persistent across navigation).
- **Guard:** `document.hasFocus()` — only focus if this window is the active one. Prevents cross-window focus stealing since both the main window and popup window share `activeSessionId` and can have `MessageInput` subscribed to the same session.
- **Approach:** Piggyback on the existing `useEffect` that already fires when `promptSuggestion` changes.
- **Timing:** Wrap focus in `requestAnimationFrame` for consistency with the existing `neovate:focus-input` pattern and to ensure the placeholder DOM update has settled.

## Change

**File:** `packages/desktop/src/renderer/src/features/agent/components/message-input.tsx`

In the existing effect (~line 404-408), add a conditional focus call:

```ts
// Force placeholder re-render when suggestion changes
useEffect(() => {
  if (!editor || editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta("promptSuggestion", promptSuggestion));
  // Focus input so Tab/Enter work immediately on the suggestion.
  // Guard with document.hasFocus() because MessageInput is used in both
  // the main window and popup window (shared activeSessionId) — without
  // this, both windows would try to steal focus simultaneously.
  if (promptSuggestion && document.hasFocus()) {
    requestAnimationFrame(() => {
      editor.commands.focus("end");
    });
  }
}, [editor, promptSuggestion]);
```

## Scope

~4 lines added to one file. No new state, events, or hooks.

## Alternatives Considered

1. **Dispatch `neovate:focus-input` from `chat.ts`** — Reuses existing event but crosses the data/UI architectural boundary. Also runs for background sessions, requiring an active-session check.
2. **Dedicated transition effect with ref** — Tracks null-to-non-null transition precisely, but adds more code for marginal benefit since the edge case (re-focus on session switch) is actually desirable.
