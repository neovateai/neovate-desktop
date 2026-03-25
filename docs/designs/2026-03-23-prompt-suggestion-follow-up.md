# Prompt Suggestion (Follow-Up) for Message Input

**Date:** 2026-03-23
**Status:** Approved

## Overview

After each assistant turn, the Claude Agent SDK can predict what the user might type next and emit a `prompt_suggestion` event. This design adds support for displaying that suggestion as dynamic placeholder text inside the TipTap message input, with Tab to accept and Enter to send directly.

The SDK plumbing is already 90% in place — `SDKPromptSuggestionMessage` is imported in shared types, the main process routes `prompt_suggestion` events through the event publisher, but the renderer currently ignores them.

## Data Flow

```
SDK Query (main process)
  → emits SDKPromptSuggestionMessage { type: "prompt_suggestion", suggestion: "run the tests" }
  → sdk-message-transformer routes to event publisher (already works)
  → ClaudeCodeChat.#handleEvent captures it (NEW)
  → stores in ClaudeCodeChatStoreState.promptSuggestion (NEW)
  → MessageInput reads it, swaps TipTap placeholder text (NEW)
  → User presses Tab → fills editor with suggestion text
  → User presses Enter on empty input → sends suggestion directly as message
  → Any typing or new turn → clears suggestion, placeholder reverts
```

## Changes by Layer

### Main Process (`session-manager.ts`)

Add `promptSuggestions: true` to the `Options` object passed to `query()` (1 line change).

### Shared Types

No changes needed. `SDKPromptSuggestionMessage` is already part of `ClaudeCodeUIEventPart`.

The SDK type shape:

```ts
type SDKPromptSuggestionMessage = {
  type: "prompt_suggestion";
  suggestion: string;
  uuid: string;
  session_id: string;
};
```

### Renderer — Chat State (`chat-state.ts`)

Add to `ClaudeCodeChatStoreState`:

```ts
promptSuggestion: string | null; // default: null
```

### Renderer — Chat Event Handler (`chat.ts`)

In `#handleEvent`:

- Handle `type === "prompt_suggestion"` → store `event.suggestion` in chat state
- On turn start (status changes to `submitted`/`streaming`) → clear suggestion to `null`

### Renderer — Display Approach: Dynamic Placeholder

Instead of a separate `Decoration.widget`, dynamically swap the TipTap Placeholder extension's text when a suggestion exists. This avoids a visual collision — the editor already renders `Placeholder.configure({ placeholder: t("chat.placeholder") })` ("Send a message...") when empty, and a second decoration would overlap.

When `promptSuggestion` is non-null:

- Replace the placeholder text with the suggestion (e.g. "run the tests")
- Style it slightly differently (`text-primary/30` instead of the default placeholder color) to hint it's actionable
- Append a subtle hint: `Tab to fill · Enter to send`
- Apply `truncate` (text-overflow: ellipsis) to prevent layout breakage from unexpectedly long suggestions

When `promptSuggestion` is null:

- Revert to the default placeholder text

Implementation: update the Placeholder extension's `placeholder` option reactively when the suggestion changes. TipTap supports reconfiguring extensions via `editor.extensionManager.extensions`.

### Renderer — Keyboard Handling (in `message-input.tsx` chatKeymap plugin)

Add to the existing `chatKeymap` ProseMirror plugin:

**Tab key** (new handler):

- Guard: skip if `document.querySelector("[data-suggestion-popup]")` exists (mention/slash-command popup open)
- Guard: skip if `Shift+Tab` (already used for plan mode toggle)
- If editor is empty and suggestion exists → set editor content to suggestion, clear suggestion
- Otherwise → default behavior

**Escape key** (modify existing handler):

- If suggestion exists → clear suggestion from store, prevent editor blur
- Otherwise → existing behavior (blur editor / clear input via double-press)

**Enter key** (modify existing handler):

- If editor is empty and suggestion exists → send suggestion text directly via `onSend`, clear suggestion, show brief notification ("Sent suggested follow-up") via the existing `addNotification` system so the user understands what happened
- Otherwise → existing behavior unchanged

### Renderer — MessageInput (`message-input.tsx`)

- Read `promptSuggestion` from the chat store via `useStore(chatStore, s => s.promptSuggestion)`
- Dynamically update the Placeholder extension text when suggestion changes
- Wire Tab/Enter handling in existing `chatKeymap` plugin (no new extension file needed)
- On send: if editor is empty and suggestion exists, send the suggestion text instead

### Race Condition: Suggestion Arrives While User Is Typing

If the user starts typing before the suggestion arrives (there's SDK-side latency after the turn), the suggestion is stored but **not displayed** — the placeholder only shows when the editor is empty. If the user clears their input later, the suggestion will appear then (if still valid). No special handling needed beyond the "only show when empty" rule.

## Ghost Text Visual Behavior

```
- Empty editor + suggestion exists → placeholder shows "run the tests  Tab to fill · Enter to send"
                                     (styled text-primary/30, truncated with ellipsis if too long)
- Empty editor + no suggestion    → placeholder shows "Send a message..." (default muted style)
- User types anything             → placeholder disappears (standard TipTap behavior)
- User presses Tab                → editor content becomes "run the tests", suggestion clears
- User presses Enter              → suggestion sent as message directly, brief notification shown
- User presses Escape             → suggestion dismissed, placeholder reverts to default
- New turn starts                 → suggestion clears, placeholder reverts
- Session changes                 → suggestion clears, placeholder reverts
```

## Dismissal Rules

Suggestion is set to `null` when:

- User sends a message (whether typed or suggestion-accepted)
- User presses Escape (explicit dismiss)
- A new turn starts (streaming begins)
- Session changes (activeSessionId changes)
- A new `prompt_suggestion` event arrives (replaces the previous one)

Note: typing does NOT clear the suggestion from the store — it just hides it because the placeholder only renders when the editor is empty. If the user deletes what they typed, the suggestion reappears.

## Files to Change

| File                                                           | Change                                                |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| `src/main/features/agent/session-manager.ts`                   | Add `promptSuggestions: true` to query options        |
| `src/renderer/src/features/agent/chat-state.ts`                | Add `promptSuggestion` field to store state           |
| `src/renderer/src/features/agent/chat.ts`                      | Handle `prompt_suggestion` event, clear on turn start |
| `src/renderer/src/features/agent/components/message-input.tsx` | Dynamic placeholder, Tab/Enter handling in chatKeymap |

No new files needed — all renderer changes fit in existing files.

## Non-Goals

- No telemetry (SDK already tracks prompt suggestion outcomes)
- No custom suggestion generation (we consume what the SDK provides)
- No speculation/auto-execute (Claude Code CLI has this infrastructure but it's disabled there too)

## Future Enhancements

- Config UI toggle in chat settings panel (SDK already respects `promptSuggestionEnabled` setting)
