# Rules Settings Page Refactor

**Date:** 2026-03-15
**Status:** Approved

## Overview

Refactor the Rules settings panel from a stub into a functional editor for the global `~/.claude/CLAUDE.md` file. Users can view, edit, and save their global rules directly from the settings UI.

## Current State

The Rules panel (`rules-panel.tsx`) is a stub with a single "Configure Rules" button that does nothing (`// TODO`). No backend IPC exists for reading/writing rule files.

## Design

### UI Layout

```
┌─ Rules ─────────────────────────────────────────┐
│                                                  │
│  Global Rules                                    │
│  ~/.claude/CLAUDE.md              [Open] [Save]  │
│  ┌──────────────────────────────────────────────┐│
│  │ You are Linus Torvalds,                      ││
│  │ KISS, YAGNI, DRY & SOLID,                   ││
│  │ ...                                          ││
│  │                                              ││
│  │                                              ││
│  └──────────────────────────────────────────────┘│
│  (unsaved indicator when content is dirty)       │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Components

- **Monospace textarea** — full-width, auto-height (min ~200px, grows with content up to a max, then scrolls)
- **Save button** — writes content back to disk; disabled when clean; shows brief checkmark/\"Saved\" feedback on success
- **Open Folder button** — opens `~/.claude/` in Finder/file manager
- **Dirty indicator** — visual cue (e.g. dot on Save button) when unsaved changes exist
- **Empty state** — if file doesn't exist, show empty textarea with placeholder explaining what CLAUDE.md does

### Keyboard Shortcuts

- **Cmd+S / Ctrl+S** — save when textarea is focused
- **Tab** — inserts spaces (overrides default focus-move behavior)

### File Watching

- Watch `~/.claude/CLAUDE.md` for external changes (e.g. user edits in VS Code after clicking "Open Folder")
- If textarea is **clean** (no unsaved edits): silently reload the new content
- If textarea is **dirty**: show a prompt — "File changed externally. Reload and lose your changes, or keep editing?"
- Use IPC subscription or polling on panel mount; stop watching on unmount

### Unsaved Changes Guard

- When user navigates to a different settings tab while the textarea is dirty, show a confirmation: "You have unsaved changes. Discard?"
- Prevent tab switch if user cancels

## Architecture

### New IPC Contract

File: `src/shared/features/rules/contract.ts`

```ts
export const rulesContract = {
  readGlobal: oc.output(type<{ content: string; path: string }>()),
  writeGlobal: oc.input(z.object({ content: z.string() })).output(type<{ success: boolean }>()),
  watchGlobal: oc.output(type<{ mtime: number }>()), // returns current mtime for polling
  openFolder: oc.output(type<{ success: boolean }>()),
};
```

### New Main-Side Router

File: `src/main/features/rules/router.ts`

- `readGlobal` — reads `~/.claude/CLAUDE.md`, returns empty string + path if file doesn't exist
- `writeGlobal` — writes content to `~/.claude/CLAUDE.md`, creates `~/.claude/` dir if needed
- `watchGlobal` — returns current `mtime` of the file (renderer polls this to detect external changes)
- `openFolder` — opens `~/.claude/` in Finder via `shell.openPath()`

### Wire Into Contract

Add `rules: rulesContract` to `src/shared/contract.ts` and corresponding router to main process.

### Refactored Rules Panel

File: `src/renderer/src/features/settings/components/panels/rules-panel.tsx`

- Loads content via `client.rules.readGlobal()` on mount
- Tracks `content` (current textarea value) and `savedContent` (last loaded/saved value)
- Dirty state: `content !== savedContent`
- Save calls `client.rules.writeGlobal({ content })` and updates `savedContent`
- Open Folder calls `client.rules.openFolder()`
- Cmd+S handler when textarea is focused
- Tab key inserts 2 spaces instead of moving focus
- Polls `client.rules.watchGlobal()` every ~2s while mounted; compares `mtime` to detect external edits
- If external change detected and textarea is clean: auto-reload
- If external change detected and textarea is dirty: show confirmation dialog
- Intercepts settings tab navigation when dirty: prompts "Discard unsaved changes?"

## Phase 2: @file Include References

### Overview

CLAUDE.md supports `@filename` includes (e.g. `@RTK.md`) — lines matching `^@(\S+)\s*$` that reference other files relative to the same directory. Show these below the textarea so users can see what's being pulled in.

### UI Layout

```
┌──────────────────────────────────────────────┐
│ [textarea content...]                        │
│ @RTK.md                                     │
└──────────────────────────────────────────────┘

Referenced files (1)
┌──────────────────────────────────────────────┐
│  📄 RTK.md       12 lines    ~/.claude/RTK.md│
│  ┌──────────────────────────────────────────┐│
│  │ # RTK - Rust Token Killer               ││
│  │ **Usage**: Token-optimized CLI proxy...  ││
│  │ ...                                      ││
│  └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

Missing file:

```
│  ⚠ missing.md     Not found                 │
```

### Components

- **Referenced files section** — appears below the textarea when `@` references are detected
- **Reference row** — shows filename, line count, resolved path; click to expand/collapse
- **Inline preview** — read-only monospace block showing file content; collapsed by default
- **Missing file indicator** — muted warning style, no expand action

### Architecture

**New IPC method** added to `rulesContract`:

```ts
resolveReferences: oc
  .input(z.object({ filenames: z.array(z.string()) }))
  .output(type<{ references: Array<{ filename: string; fullPath: string; exists: boolean; lineCount: number; content: string }> }>()),
```

**Frontend parsing:**

- `useMemo` extracts filenames from content via regex `^@(\S+)\s*$` (multiline)
- Debounced (~500ms) IPC call to `rules.resolveReferences()` when extracted filenames change
- Each reference is expandable/collapsible; state tracked locally

**Backend handler:**

- Resolves each filename relative to `~/.claude/`
- If file exists: reads content, counts lines, returns both
- If file doesn't exist: returns `exists: false`, empty content, `lineCount: 0`

### Behavior

- List updates as user types (debounced 500ms)
- Only `^@filename` on its own line is treated as an include
- Clicking a row toggles expand/collapse of the inline preview
- Content in preview is read-only, monospace, with a max-height and scroll
- No recursive resolution (if `RTK.md` itself has `@` includes, those are not shown)

## Scope

- Global `~/.claude/CLAUDE.md` only (no project-scoped rules in this iteration)
- Auto-creates `~/.claude/` directory and file on first save if they don't exist
