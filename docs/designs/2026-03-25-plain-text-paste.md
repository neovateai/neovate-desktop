# Plain Text Paste in Message Input

## 1. Background

When pasting formatted text (e.g., from a webpage, VS Code, or another app) into the chat message input, the TipTap editor preserves rich formatting (bold, italic, code, etc.). This is misleading because `onSend` takes a `string` and `extractText(editor.getJSON())` flattens everything to plain text before sending. The formatting is visual fiction.

## 2. Requirements Summary

**Goal:** Strip formatting on all paste operations in the chat input editor so that pasted content always arrives as plain text.

**Scope:**

- In scope: Strip HTML/rich formatting on paste, preserve newlines, keep image paste working
- Out of scope: Rich text editing features, formatted paste escape hatch (Shift+Cmd+V)

**Key Decisions:**

- Always strip formatting, no exceptions — the editor is a plain-text chat input
- No modifier-key bypass — would create false expectations about what gets sent

## 3. Acceptance Criteria

1. All paste operations strip formatting (bold, italic, code, syntax highlighting, etc.)
2. Newlines in pasted text are preserved as paragraph breaks
3. Image paste via the existing extension is unaffected
4. No new dependencies

## 4. Problem Analysis

- **Current behavior:** TipTap's StarterKit parses pasted HTML and preserves marks (bold, italic, code, etc.) even though headings, lists, and blockquotes are disabled
- **Chosen approach:** Use `transformPastedHTML` editor prop to strip all formatting from pasted HTML before ProseMirror parses it

## 5. Decision Log

**1. Where to intercept paste?**

- Options: A) `editorProps.transformPastedHTML` · B) New extension with `handlePaste` plugin · C) `editorProps.handlePaste`
- Decision: **A) `transformPastedHTML`** — No new imports needed, doesn't interfere with existing image paste plugin ordering, and is the designated ProseMirror API for transforming pasted HTML before parsing

**2. How to preserve newlines?**

- Options: A) Return plain text (newlines collapsed) · B) Convert to `<p>` tags
- Decision: **B) Convert to `<p>` tags** — ProseMirror parses HTML, so returning `<p>` per line preserves paragraph structure

**3. How to extract text from HTML?**

- Options: A) `document.createElement("div").innerText` · B) `DOMParser().parseFromString().body.innerText`
- Decision: **B) DOMParser** — `innerText` on a detached element may not respect block-level line breaks; `DOMParser` creates a document context where `innerText` correctly inserts `\n` for block elements

## 6. Design

Add `transformPastedHTML` to the existing `editorProps` in the `useEditor` call. This function:

1. Parses the pasted HTML via `DOMParser`
2. Extracts plain text via `innerText` (preserves block-level line breaks)
3. Splits by newlines and wraps each line in `<p>` tags with HTML-escaped content
4. Returns clean HTML with no formatting marks

`transformPastedHTML` only runs when `handlePaste` (used by image-paste extension) doesn't handle the event, so image paste is unaffected.

```typescript
transformPastedHTML(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = doc.body.innerText || "";
  return text
    .split("\n")
    .map((line) => {
      if (!line) return "<p></p>";
      const escaped = line
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      return `<p>${escaped}</p>`;
    })
    .join("");
},
```

## 7. Files Changed

- `packages/desktop/src/renderer/src/features/agent/components/message-input.tsx` — add `transformPastedHTML` to `editorProps`

## 8. Verification

1. [AC1] Paste formatted text (bold/italic/code from a webpage) — should appear as plain text
2. [AC2] Paste multi-line text — each line should be a separate paragraph
3. [AC3] Paste an image — should still create an image attachment, not affected
4. [AC4] No new packages added to package.json
