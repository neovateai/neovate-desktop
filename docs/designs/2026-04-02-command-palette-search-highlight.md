# Cmd+K Search Keyword Highlighting

## Overview

When the user types a search query in the command palette, matched word segments in **label** and **preview** text are visually highlighted with bold + subtle background tint.

## Highlight Style

- Matched segments: `font-semibold bg-primary/15 rounded-xs` (bold text with a light pink/brand tint behind it)
- Unmatched segments: unchanged (normal weight, no background)
- Works in both light and dark themes since `bg-primary/15` is opacity-based

## Implementation

### New utility function

`highlightMatches(text: string, query: string): ReactNode`

- Takes the display text and the current search query
- Splits query into words (same logic as the existing `matchItem` in `command-palette.tsx:63-67`)
- Walks the text, finds each query-word occurrence (case-insensitive), and wraps matched substrings in a styled `<mark>` element
- Overlapping/adjacent matches are merged so highlights don't nest or stutter
- Returns the original string unchanged when query is empty

### Changes to `PaletteItem`

Pass `searchQuery` as a new prop, use `highlightMatches` to render:

- `item.label` (currently plain `<span>{item.label}</span>`)
- `item.preview` (currently plain `<span>{item.preview}</span>`)
- `item.metadata` (currently plain `<span>{item.metadata}</span>`) — highlights project name matches

### `<mark>` element

Use the semantic `<mark>` HTML element for highlighted segments. Reset the default browser yellow background and apply custom styles. Screen readers announce `<mark>` as "highlighted text", which is appropriate here.

### No changes to

- Search logic (`matchItem`)
- Store (`store.ts`)
- Types (`types.ts`)
- Registry (`use-command-registry.ts`)

Pure rendering concern.

## Edge Cases

- **Empty query** — no highlighting, plain text
- **Multiple words** — each word highlighted independently (e.g. query "toggle term" highlights "**Toggle** **Term**inal")
- **Match in keywords but not in label** — no highlight shown (correct — keywords are invisible search helpers)
- **HTML-safe** — we're building React nodes, not injecting HTML strings

## Scope

- ~40 lines of new utility code
- ~10 lines of changes in `PaletteItem`
- No new dependencies
