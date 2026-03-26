# Disable Rich Text Features in Message Input

## 1. Background

The message input uses TipTap with StarterKit, which enables formatting marks (bold, italic, code, strike) by default. These create unwanted rich text behavior — Cmd+B triggers bold instead of the global toggleSidebar binding, backticks create code marks instead of literal characters, etc. The input should behave as plain text while keeping TipTap for structural features (mentions, slash commands, image paste).

## 2. Requirements Summary

**Goal:** Strip all rich-text formatting marks from the TipTap message input.

**Scope:**

- In scope: Disable Bold, Italic, Code, CodeBlock, Strike, HorizontalRule in StarterKit
- Out of scope: Mentions, slash commands, image paste, hard breaks, undo/redo (all kept)

## 3. Acceptance Criteria

1. Cmd+B does not bold text (resolves conflict with global toggleSidebar binding)
2. Typing backticks or triple backticks produces literal characters, not code marks/blocks
3. `~~`, `*`, `**` produce literal characters, not formatting
4. Mentions, slash commands, image paste, hard breaks, and undo/redo continue to work
5. `bun ready` passes

## 4. Problem Analysis

Current StarterKit config disables heading, bulletList, orderedList, blockquote but leaves bold, italic, code, codeBlock, strike active. These formatting marks have keyboard shortcuts and input rules that interfere with expected plain-text behavior.

- **Approach A** — Replace StarterKit with individual extension imports -> more invasive, potential new deps
- **Chosen approach** — Add disable flags to existing StarterKit.configure() -> minimal change, 5 added lines

## 5. Decision Log

**1. Disable strategy?**

- Options: A) Add disable flags to StarterKit.configure() - B) Replace StarterKit with individual imports
- Decision: **A)** — 5 added lines vs rewriting imports. KISS.

**2. Which extensions to disable?**

- Options: A) Only bold+code - B) All formatting marks (bold, italic, code, codeBlock, strike)
- Decision: **B)** — User asked for "related rich text features", disable all formatting marks comprehensively.

**3. Clean up extract-text.ts codeBlock serialization?**

- Options: A) Remove dead code path - B) Leave it
- Decision: **B)** — Dead code is harmless, removing is unnecessary churn.

## 6. Design

Add `bold: false`, `italic: false`, `code: false`, `codeBlock: false`, `strike: false`, `horizontalRule: false` to the existing `StarterKit.configure()` call in `message-input.tsx`. This removes:

- All formatting keyboard shortcuts (Cmd+B, Cmd+I, Cmd+E, Cmd+Shift+S)
- All formatting input rules (**bold**, _italic_, ~~strike~~, `code`, `codeblock`, ---)
- The corresponding ProseMirror marks/nodes from the schema

Remaining StarterKit extensions (hardBreak, history, paragraph, document, text, listItem) are unaffected.

## 7. Files Changed

- `packages/desktop/src/renderer/src/features/agent/components/message-input.tsx` — add 6 disable flags to StarterKit.configure()

## 8. Verification

1. [AC1] Focus message input, press Cmd+B — should not bold text, sidebar should toggle
2. [AC2] Type single backtick and triple backticks — should appear as literal characters
3. [AC3] Type `~~text~~`, `*text*`, `**text**` — should appear as literal characters
4. [AC4] Type `@` to trigger mention, `/` to trigger slash command, paste image, Shift+Enter for line break, Cmd+Z for undo — all work
5. [AC5] Run `bun ready` — passes
