# Terminal File Path Links

## 1. Background

The terminal panel (xterm.js) currently only detects HTTP/HTTPS URLs via `WebLinksAddon`. File paths in terminal output (compiler errors, stack traces, grep results) are not clickable. Users should be able to click file paths to open them in the editor.

## 2. Requirements Summary

**Goal:** Make file paths in terminal output clickable to open them in the editor.

**Scope:**

- In scope: Detecting absolute (`/`) and home-relative (`~/`) file paths with known extensions in xterm.js terminal output, making them clickable, opening in editor via existing `OpenerService`
- Out of scope: The ANSI chat terminal component (`components/ai-elements/terminal.tsx`), project-relative path detection
- Known limitation: Column number is parsed by `parseFilePath` but `OpenerService.normalize()` only handles `:line` (not `:line:col`). The activate handler passes only `:line` to avoid path corruption.
- Known limitation: File paths that soft-wrap across terminal lines will not be detected (xterm.js `ILinkProvider` operates per-line).

**Key Decisions:**

1. Use `xterm.registerLinkProvider()` — native xterm.js API for custom link detection
2. Reuse `parseFilePath()` logic from `lib/filepath.ts` — already handles the right formats
3. Open via `OpenerService.open()` — same pattern as markdown file paths, search results

## 3. Acceptance Criteria

1. File paths (absolute `/` and `~/` with known extensions) in terminal output are visually indicated on hover (underline)
2. Clicking a file path opens it in the editor content panel
3. Line numbers in paths (e.g., `/foo/bar.ts:42`) are passed through to the editor
4. `~/` paths are resolved to the user's home directory
5. Existing URL click behavior (WebLinksAddon) is not broken
6. No regression in terminal performance

## 4. Problem Analysis

Current state: Terminal has `WebLinksAddon` for URL detection only. No `registerLinkProvider` usage anywhere. The `parseFilePath()` utility exists in `lib/filepath.ts` but is only used for markdown inline code.

- **Approach A** — Modify WebLinksAddon regex to also match file paths -> rejected, WebLinksAddon is designed for URLs only
- **Approach B** — Parse full terminal buffer on each write -> rejected, performance concern
- **Chosen approach** — Register a custom `ILinkProvider` via `xterm.registerLinkProvider()`. This is lazy (only evaluates on hover), performant, and the intended xterm.js API for custom link types.

## 5. Decision Log

**1. How to detect file paths in terminal output?**

- Options: A) Custom `ILinkProvider` with regex scanning · B) Fork WebLinksAddon · C) Parse buffer on write
- Decision: **A)** — `registerLinkProvider` is lazy (per-line on hover), native API, no performance concern

**2. Where to put the scanning logic?**

- Options: A) Inline in terminal-view.tsx · B) Add to `lib/filepath.ts`
- Decision: **B)** — Pairs with existing `parseFilePath()`, reusable, testable

**3. Click activation model?**

- Options: A) Plain click · B) Cmd/Ctrl+click
- Decision: **A)** — Matches current WebLinksAddon behavior on master

**4. How to open files?**

- Options: A) Direct oRPC call · B) `OpenerService.open()`
- Decision: **B)** — Same pipeline as markdown file paths, search, tool buttons

## 6. Design

### New function: `findFilePathsInText()`

Added to `lib/filepath.ts`. Two-pass approach:

**Pass 1 — Candidate extraction:** A non-anchored regex scans for substrings starting with `/` or `~/`, containing path characters (letters, digits, `/`, `.`, `~`, `@`, `#`, `-` — no spaces), ending with a known file extension, optionally followed by `:line` or `:line:col`. Uses the same extension list as `parseFilePath` (shared constant).

**Pass 2 — Validation:** Each candidate is checked:

- Must start with `/` or `~/` (the regex `[/~]` could match a bare `~` without `/`)
- Preceding character must be start-of-string, whitespace, or a delimiter (`'`, `"`, `` ` ``, `(`, `[`, `,`, `;`) — this prevents matching paths inside URLs (e.g., `https://example.com/path.html` where `/path.html` is preceded by `m`)
- Validated through `parseFilePath()` for final confirmation

Returns `FilePathMatch[]` with `{ path, line, col, start, end }` where `start`/`end` are 0-based string indices.

Note: `translateToString()` on xterm buffer lines returns plain text with ANSI escape codes stripped, so regex operates on clean text.

### Link provider registration

In `terminal-view.tsx`, after creating the xterm instance:

1. Import `useRendererApp()` to get `app.opener`
2. Register an `ILinkProvider` via `xterm.registerLinkProvider()`
3. `provideLinks(bufferLineNumber)` gets line text via `buffer.active.getLine(bufferLineNumber - 1).translateToString()`, calls `findFilePathsInText()`, maps results to `ILink[]`. Note: xterm.js uses 1-based line numbers and 1-based column positions in `IBufferRange`. Convert 0-based `start`/`end` from `findFilePathsInText` to 1-based `x` positions (`start + 1` for start, `end` for inclusive end).
4. `ILink.activate()` resolves `~/` via `window.api.homedir`, then passes only `path:line` (NOT `path:line:col`) to `app.opener.open()` — because `OpenerService.normalize()` uses a greedy regex that would corrupt the path if `:col` is appended.
5. Dispose the link provider in cleanup

### Data flow

```
Terminal output → xterm buffer
                    ↓ (on hover)
              ILinkProvider.provideLinks(lineNumber)
                    ↓
              findFilePathsInText(lineText)
                    ↓
              ILink[] with ranges
                    ↓ (on click)
              ILink.activate()
                    ↓
              app.opener.open("/resolved/path:line")
                    ↓
              OpenerService → ExternalUriOpenerService → Editor plugin
```

## 7. Files Changed

- `src/renderer/src/lib/filepath.ts` — Add `findFilePathsInText()` scanner function
- `src/renderer/src/plugins/terminal/terminal-view.tsx` — Import `useRendererApp`, register file path link provider
- `src/renderer/src/lib/__tests__/filepath.test.ts` — Tests for `findFilePathsInText()`

## 8. Verification

1. [AC1] Hover over a file path in terminal output → underline decoration appears
2. [AC2] Click the file path → editor content panel opens with the file
3. [AC3] Click `/path/file.ts:42` → editor opens at line 42
4. [AC4] Click `~/Documents/file.ts` → resolves to home dir and opens
5. [AC5] Click an HTTP URL → still opens in browser (WebLinksAddon unchanged)
6. [AC6] Terminal scrolling and typing remain responsive
