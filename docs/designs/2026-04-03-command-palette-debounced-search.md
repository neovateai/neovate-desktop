# Cmd+K Debounced Search Filtering

## Problem

Every keystroke in the command palette search input immediately triggers filtering (`filteredItems` recomputation) and re-rendering of all result items. With a large session list, rapid typing causes unnecessary intermediate filter/render cycles.

## Solution

Split input state into `query` (instant display) and `debouncedQuery` (delayed, drives filtering). The input remains responsive while filtering only runs after the user pauses typing.

## Approach

`useState` + `useEffect` with `setTimeout` (150ms delay). No new dependencies.

```
keystroke -> setQuery (instant) -> input displays new text
          -> setTimeout 150ms -> setDebouncedQuery -> filteredItems recomputes -> results re-render
```

## Changes

File: `packages/desktop/src/renderer/src/features/command-palette/command-palette.tsx`

### 1. New state

```tsx
const [debouncedQuery, setDebouncedQuery] = useState("");
```

### 2. Debounce effect (with instant bypass)

```tsx
useEffect(() => {
  // Bypass debounce when query is cleared (instant return to full list)
  // or when entering command mode via ">" (instant structural switch)
  if (!query || query === ">") {
    setDebouncedQuery(query);
    return;
  }
  const timer = setTimeout(() => setDebouncedQuery(query), 150);
  return () => clearTimeout(timer);
}, [query]);
```

Two cases skip the 150ms delay:

- **Empty query**: clearing the input should instantly show the full unfiltered list, not lag behind
- **Bare ">"**: typing ">" to enter command mode should immediately switch the result structure; continuing to type ">foo" debounces normally; deleting back to ">" flushes again

### 3. Reset on open

Add `setDebouncedQuery("")` to the existing reset effect (alongside `setQuery("")`).

### 4. Derive from debouncedQuery

Change the search query derivation to use `debouncedQuery` instead of `query`:

```tsx
const isCommandMode = debouncedQuery.startsWith(">");
const searchQuery = isCommandMode
  ? debouncedQuery.slice(1).trim().toLowerCase()
  : debouncedQuery.trim().toLowerCase();
```

## What stays the same

- Input responsiveness (user sees characters instantly)
- Keyboard navigation (ArrowUp/Down/Enter/Escape) operates on the visible filtered list
- All downstream logic (`filteredItems`, `highlightMatches`, `PaletteItem`) already uses `searchQuery`/`isCommandMode`
- Store, types, registry — untouched

## Edge cases

- **Empty query**: debounce is bypassed — clearing the input instantly restores the full unfiltered list
- **">" mode switch**: debounce is bypassed — entering command mode instantly switches result structure
- **">foo" typing**: after the initial ">" bypass, subsequent characters ("f", "o", "o") are debounced normally

## Scope

- ~5 lines of new code in `command-palette.tsx`
- No new files or dependencies
