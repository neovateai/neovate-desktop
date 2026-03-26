# Copy Markdown Button on Assistant Messages

## 1. Background

Users want a quick way to copy the raw markdown text of assistant responses to their clipboard. Currently, only code blocks within messages have copy buttons. There is no way to copy the full markdown of a text response.

## 2. Requirements Summary

**Goal:** Add a "Copy Markdown" icon button under each assistant text response in the chat UI.

**Scope:**

- In scope: Copy button on assistant text parts, copies raw markdown to clipboard
- Out of scope: Copy for reasoning parts, tool parts, user messages

**Key Decisions:**

- Each assistant text part rendered by `MessagePartRenderer` is considered a "final result"
- For collapsible messages, the trailing text is the final result; for non-collapsible, all text parts are results
- Copy the raw markdown string (`part.text`), not rendered HTML

## 3. Acceptance Criteria

1. A copy icon appears under the last assistant text block per message on hover
2. Clicking the icon copies the raw markdown text to clipboard
3. Icon changes to a checkmark for ~2 seconds after copying (visual feedback)
4. Uses existing `MessageActions`/`MessageAction` primitives from `message.tsx`
5. Uses `lucide-react` icons (`CopyIcon` / `CheckIcon`)
6. Tooltip text uses i18n (`t()`) for consistency
7. Copy button only appears on the trailing/final message, not on collapsed intermediate content
8. Timeout is cleaned up on unmount (no stale state updates)
9. Copy button is not shown if text is empty or whitespace-only

## 4. Decision Log

**1. Which icon library?**

- Options: A) lucide-react B) @hugeicons/core-free-icons
- Decision: **A) lucide-react** -- CLAUDE.md specifies lucide for general UI; hugeicons is for sidebar/plugin icons only

**2. Where to place the button?**

- Options: A) Floating overlay on message B) Below MessageContent inside Message component C) Separate toolbar row
- Decision: **B) Below MessageContent** -- Uses existing `MessageActions` component which is already styled for hover-reveal inside `Message` (`opacity-0 group-hover:opacity-100`)

**3. What content to copy?**

- Options: A) Raw markdown (`part.text`) B) Rendered plain text (strip formatting) C) Rendered HTML
- Decision: **A) Raw markdown** -- Most useful for developers; preserves formatting for pasting into other markdown-aware tools

**4. Copy feedback pattern?**

- Options: A) Toast notification B) Icon state change (copy -> check) C) Both
- Decision: **B) Icon state change** -- Matches existing code-block copy pattern (`CodeBlockCopyButton` in `code-block.tsx`); lightweight, no extra UI needed

**5. Scope of button placement?**

- Options: A) Only on the last text part per message B) On every assistant text part
- Decision: **A) Only on the last text part** -- The last text part is the final result; intermediate text parts don't need copy buttons

## 5. Design

### Component: `CopyMarkdownButton`

A small self-contained component added directly in `message-parts.tsx`. Uses:

- `useState` for copied state
- `useCallback` for the click handler
- `useRef` to track the timeout, cleaned up in `useEffect` return (prevents state updates on unmounted components — matches `CodeBlockCopyButton` pattern)
- `navigator.clipboard.writeText()` for clipboard access
- `setTimeout` with 2-second delay to reset icon state
- Wrapped in `MessageAction` with `tooltip={t("chat.messages.copyMarkdown")}`
- Tooltip text goes through `react-i18next` `t()` for i18n consistency

### Collapsible message handling

`AssistantMessageParts` calls `MessagePartRenderer` twice for collapsible messages: once for the collapsed content, once for the trailing message. To avoid showing the copy button on intermediate text parts inside the collapsed section, pass a `showCopyAction` prop to `MessagePartRenderer`:

- `showCopyAction={false}` for the collapsible content renderer
- `showCopyAction={true}` for the trailing message renderer
- `showCopyAction={true}` when rendering the full message (non-collapsible path)
- Defaults to `true` so callers don't need to pass it explicitly in the common case

### Integration Point

In `MessagePartRenderer`, the `case "text"` branch. When `message.role === "assistant"`, `showCopyAction` is true, and this is the last text part in the message, add `MessageActions` containing `CopyMarkdownButton` after `MessageContent`, inside the existing `Message` wrapper.

Determine "last text part" by finding the last index where `part.type === "text"` in `message.parts`, then comparing against the current loop index.

```tsx
case "text":
  return (
    <Message key={...} from={message.role}>
      <MessageContent>
        {message.role === "assistant" ? (
          <MessageResponse>{part.text}</MessageResponse>
        ) : (
          <p className="m-0 whitespace-pre-wrap">{part.text}</p>
        )}
      </MessageContent>
      {message.role === "assistant" && showCopyAction && isLastTextPart && part.text.trim() && (
        <MessageActions>
          <CopyMarkdownButton text={part.text} />
        </MessageActions>
      )}
    </Message>
  );
```

### Data Flow

1. User hovers over assistant text block -> `MessageActions` becomes visible (CSS transition)
2. User clicks copy icon -> `navigator.clipboard.writeText(part.text)` called
3. Icon changes from `CopyIcon` to `CheckIcon`
4. After 2 seconds, icon reverts to `CopyIcon`
5. On unmount, pending timeout is cleared via ref

## 6. Files Changed

- `packages/desktop/src/renderer/src/features/agent/components/message-parts.tsx` -- Add `CopyMarkdownButton` component; add `showCopyAction` prop to `MessagePartRenderer`; add `MessageActions` to last assistant text part when `showCopyAction` is true
- i18n translation files -- Add `chat.messages.copyMarkdown` key

## 7. Verification

1. [AC1] Hover over the last assistant text block in a message -- copy icon appears below the text
2. [AC2] Click the copy icon -- paste into a text editor and verify raw markdown is copied
3. [AC3] After clicking, icon changes to checkmark for ~2 seconds, then reverts
4. [AC4] Inspect DOM -- button is rendered inside `MessageActions`/`MessageAction` components
5. [AC5] Inspect imports -- icons come from `lucide-react`, not hugeicons
6. [AC6] Expand a collapsible message -- no copy button on intermediate text parts inside the collapsed section
7. [AC7] Tooltip text uses `t()` translation function
8. [AC8] Rapidly navigate away and back -- no console warnings about state updates on unmounted components
