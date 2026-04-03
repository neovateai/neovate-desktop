# Markdown File Path Detection

**Date:** 2026-03-26
**Branch:** feat/markdown-filepath-detection

## What We're Building

Detect file paths inside inline code spans in AI markdown responses and render them with distinct visual treatment (file icon, clickable). This is scoped to `MessageResponse` only — shared `markdownBaseComponents` stays untouched.

## Why This Approach

### Industry Research

| Tool                        | Detection Method                              | False Positive Strategy                    |
| --------------------------- | --------------------------------------------- | ------------------------------------------ |
| VS Code Copilot             | Server-side structured `inlineReference` data | No detection needed — paths are explicit   |
| Continue.dev                | Match inline code vs known context files      | Only matches files already in conversation |
| Cursor/Aider/ChatGPT/Claude | No special handling                           | —                                          |

### Chosen Approach: Regex Heuristic (v1)

- Simplest path to value — zero new dependencies, minimal code change
- Require known file extension to minimize false positives
- Can layer context-aware matching (Continue.dev style) later as v2

## Key Decisions

- **Detection logic in `lib/filepath.ts`**: Pure utility functions (`isFilePath`, `parseFilePath`), no React, no side effects
- **Override `inlineCode` in `MessageResponse` only**: Streamdown's `inlineCode` virtual component targets inline code spans without affecting code blocks. `markdownBaseComponents` stays generic; file path awareness is a concern of the message rendering scene
- **Click behavior owned by `MessageResponse`**: The component that provides `inlineCode` also handles the click action (e.g., oRPC call to open file in editor), keeping coupling local
- **Streamdown integration via `components` prop**: `{ ...markdownBaseComponents, inlineCode: FilePathInlineCode }` — no remark/rehype plugin needed

## Detection Rules (`lib/filepath.ts`)

Simple: if it ends with a known file extension, it's a file path. Optionally followed by `:line` or `:line:col`.

```ts
// Match: src/Button.tsx, ./utils.ts, file.py:42, path/to/mod.rs:10:5
// Reject: useState(), npm install, https://example.com
const FILE_PATH_RE =
  /^(.+\.(?:tsx?|jsx?|mjs|cjs|py|rs|go|rb|java|kt|swift|c|cpp|h|hpp|cs|php|sh|sql|css|scss|html|xml|svg|vue|svelte|astro|md|mdx|json|ya?ml|toml|env|lock|graphql|prisma))(?::(\d+)(?::(\d+))?)?$/;
```

### `parseFilePath` Return Shape

```ts
interface FilePathInfo {
  path: string; // "src/components/Button.tsx"
  line?: number; // 42
  col?: number; // 10
}
```

## File Layout

```
packages/desktop/src/renderer/src/
├── lib/
│   └── filepath.ts              # isFilePath(), parseFilePath() — pure functions
└── components/ai-elements/
    └── message.tsx              # MessageResponse overrides `code` component
```

## Rendering

- File path inline code gets a file icon (lucide `FileIcon`) and distinct styling
- Clickable — click handler is defined in `MessageResponse` scope
- Non-file-path inline code falls back to default `MarkdownInlineCode` rendering

## Out of Scope (v1)

- Context-aware matching against workspace file tree (v2)
- File existence validation
- Hover preview of file contents
- Drag and drop support
- Right-click context menu
- Plain text (non-inline-code) file path detection

## Next Steps

1. Implement `lib/filepath.ts` with tests
2. Override `code` in `MessageResponse` with file path detection
3. `bun ready` to verify
