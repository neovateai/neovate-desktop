# Fix: `sendMessageWith` config not applied

**Date:** 2026-03-13
**Status:** Proposed

## Problem

The `sendMessageWith` setting (`"enter"` | `"cmdEnter"`) in Chat Settings has no effect.
The keyboard handler in `message-input.tsx` is hardcoded to always send on bare Enter.

## Root Cause

`packages/desktop/src/renderer/src/features/agent/components/message-input.tsx` lines 132-144:
The ProseMirror `chatKeymap` plugin ignores the `sendMessageWith` config value entirely.

## Design

Use the `useLatestRef` pattern (already used in this file for `cwdRef`, `attachmentsRef`) to expose the config value to the ProseMirror plugin closure.

### Changes

#### 1. `packages/desktop/src/renderer/src/features/agent/components/message-input.tsx`

Subscribe to the config value and create a ref:

```ts
const sendMessageWith = useConfigStore((s) => s.sendMessageWith);
const sendMessageWithRef = useLatestRef(sendMessageWith);
```

Update `handleKeyDown` in the `chatKeymap` plugin:

```ts
handleKeyDown(_view, event) {
  const mode = sendMessageWithRef.current;

  // Bare Enter (no modifier)
  if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
    if (document.querySelector("[data-suggestion-popup]")) return false;

    if (mode === "cmdEnter") {
      // bare Enter in cmdEnter mode -> insert newline (default ProseMirror behavior)
      return false;
    }

    // mode === "enter": send
    event.preventDefault();
    const text = extractText(editor.getJSON()).trim();
    if (NEW_CHAT_EASTER_EGGS.has(text.toLowerCase())) {
      editor.commands.clearContent();
      createNewSession(cwdRef.current);
      return true;
    }
    send();
    return true;
  }

  // Cmd/Ctrl+Enter
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    if (document.querySelector("[data-suggestion-popup]")) return false;

    if (mode === "cmdEnter") {
      // send
      event.preventDefault();
      const text = extractText(editor.getJSON()).trim();
      if (NEW_CHAT_EASTER_EGGS.has(text.toLowerCase())) {
        editor.commands.clearContent();
        createNewSession(cwdRef.current);
        return true;
      }
      send();
      return true;
    }

    // mode === "enter": Cmd+Enter -> insert newline
    editor.commands.setHardBreak();
    return true;
  }

  if (event.key === "Enter" && event.altKey) {
    editor.commands.setHardBreak();
    return true;
  }

  // ... rest unchanged (Shift+Tab, Escape)
}
```

#### 2. `packages/desktop/src/renderer/src/features/agent/components/input-toolbar.tsx`

Add a `title` tooltip on the send button reflecting the current keybinding:

```tsx
// Add to InputToolbar props or read directly:
const sendMessageWith = useConfigStore((s) => s.sendMessageWith);

// On the send button (line 87):
<Button
  type="button"
  size="icon"
  className="h-7 w-7"
  disabled={disabled}
  onClick={onSend}
  title={sendMessageWith === "cmdEnter" ? "Send (⌘+Enter)" : "Send (Enter)"}
>
```

## Behavior Matrix

| Key combo      | mode=`"enter"`    | mode=`"cmdEnter"` |
| -------------- | ----------------- | ----------------- |
| Enter          | Send              | Newline           |
| Cmd/Ctrl+Enter | Newline           | Send              |
| Shift+Enter    | Newline (default) | Newline (default) |
| Alt+Enter      | Hard break        | Hard break        |

## Notes

- No new abstractions; follows existing `useLatestRef` convention.
- `event.metaKey` covers Cmd on macOS; `event.ctrlKey` covers Ctrl on Windows/Linux.
- Suggestion popup guard applied on both Enter and Cmd+Enter paths.
- Easter egg handling remains on the send path regardless of mode.
- Send button tooltip updates reactively via `useConfigStore`.
