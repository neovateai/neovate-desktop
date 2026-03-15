# Review Large Diff Performance

## Overview

Solve performance problems when rendering large PR diffs in the review view. Covers four scenarios: large files with small changes, massive change sets, high file counts, and combinations of all three.

## Approach

Four-layer defense-in-depth, pure frontend changes, no backend API modifications.

| Layer | Measure                                  | Scenarios                   |
| ----- | ---------------------------------------- | --------------------------- |
| L1    | `@pierre/diffs` built-in options         | Large file, small change    |
| L2    | File-level guards                        | Extreme files               |
| L3    | Intersection Observer viewport rendering | Many files                  |
| L4    | Progressive expand all                   | Many files expanded at once |

## L1 — @pierre/diffs Options

Pass performance-related options to all `MultiFileDiff` instances. Currently only `theme` and `diffStyle` are used, but the library supports:

```tsx
<MultiFileDiff
  oldFile={...}
  newFile={...}
  options={{
    theme,
    diffStyle,
    expandUnchanged: false,      // collapse unchanged context into clickable separators
    expansionLineCount: 20,      // expand 20 lines per click
    tokenizeMaxLineLength: 500,  // skip syntax highlighting for lines > 500 chars
  }}
/>
```

**Effect:**

- 5000-line file with 3 changed lines → renders ~10 lines (changes + context), rest collapsed as separators
- Users click separators to expand context in 20-line chunks (built-in `@pierre/diffs` behavior)
- Minified JS/CSS won't hang on syntax highlighting of 100k-char lines

**Apply to both `review-view.tsx` and `git-diff-view.tsx`.**

## L2 — File-Level Guards

Three guards in `renderFileDiff`, before passing data to `MultiFileDiff`:

### 2a. Large file guard (>1MB)

Check `diff.oldContent.length + diff.newContent.length > 1_000_000` after diff is loaded. Show placeholder instead of diff:

```
┌─ vendor/huge-bundle.min.js (M) ─────────┐
│   File too large to display diff (2.3 MB)│
└──────────────────────────────────────────┘
```

### 2b. Binary file guard

Detect null bytes in content: `content.slice(0, 8192).includes("\0")`. Show placeholder:

```
┌─ assets/logo.png (M) ───────────────────┐
│   Binary file changed                    │
└──────────────────────────────────────────┘
```

### 2c. High file count warning (>200 files)

Show warning banner below stats line:

```
⚠ 242 files — large diff may be slow. All files collapsed by default.
```

Show a confirmation prompt on "Expand All" when file count exceeds 200.

### Locales

Add guard-related strings to `en-US.json` and `zh-CN.json`.

## L3 — Intersection Observer Viewport Rendering

Currently, expanding a file immediately mounts `MultiFileDiff` regardless of viewport position. With expand-all on 200 files, all 200 diff components render simultaneously.

### Design

Introduce a `LazyDiffContent` wrapper component that uses Intersection Observer to control mounting:

```tsx
function LazyDiffContent({ file, diff, loading, ...props }) {
  const ref = useRef<HTMLDivElement>(null);
  const isVisible = useIntersectionObserver(ref, {
    rootMargin: "200px",  // start rendering 200px before entering viewport
    once: false,          // allow unmount when scrolled out
  });

  return (
    <div ref={ref} style={{ minHeight: loading ? 80 : undefined }}>
      {loading ? (
        <Spinner />
      ) : isVisible ? (
        <MultiFileDiff ... />
      ) : (
        <div style={{ height: lastKnownHeight }} />  {/* preserve scroll position */}
      )}
    </div>
  );
}
```

### Height measurement

When `MultiFileDiff` first renders, measure its height via `ref.current.offsetHeight` and store in a `Record<string, number>` keyed by `relPath`. When the component scrolls out of viewport and unmounts, use the stored height as placeholder `div` height. This prevents scrollbar jumps during unmount/remount cycles.

### scrollToFile compatibility

When a user clicks a file in the file tree, `scrollIntoView` triggers before the Intersection Observer callback fires (async). This causes a flash of empty placeholder. To fix: `scrollToFile` should set a `forceVisible` flag for the target file, bypassing the observer check so `MultiFileDiff` mounts immediately on scroll.

### Key details

- `rootMargin: "200px"` — pre-render before entering viewport, no visible delay
- Scrolling out preserves measured height as placeholder, preventing scrollbar jumps
- `once: false` — unmount when out of viewport to free memory; `@pierre/diffs` has internal render cache so re-mount doesn't recompute diff
- `useIntersectionObserver` is a simple custom hook (~20 lines), no new dependencies

### New file

`hooks/useIntersectionObserver.ts` — generic reusable hook.

### Effect

- Expand All 200 files → only ~5 `MultiFileDiff` instances in DOM at any time
- Memory usage drops from O(n) to O(visible files)

## L4 — Progressive Expand All

Current `expandAll` adds all files to `expandedFiles` Set at once and fires 5 concurrent `loadDiff` requests. Even with L3 viewport protection, this sends all diff requests simultaneously.

### Design

Batch expansion with idle callbacks:

```tsx
const expandAll = () => {
  const ordered = files.map((f) => f.relPath);
  let idx = 0;

  const expandBatch = () => {
    const batch = ordered.slice(idx, idx + 10); // 10 files per batch
    if (batch.length === 0) return;
    idx += batch.length;

    setExpandedFiles((prev) => {
      const next = new Set(prev);
      batch.forEach((p) => next.add(p));
      return next;
    });

    // 5 concurrent loadDiff per batch
    let loadIdx = 0;
    const loadNext = () => {
      if (loadIdx >= batch.length) return;
      const relPath = batch[loadIdx++];
      if (!diffs[relPath] && !loadingDiffs[relPath]) {
        loadDiff(relPath).then(loadNext);
      } else {
        loadNext();
      }
    };
    for (let i = 0; i < Math.min(5, batch.length); i++) loadNext();

    requestIdleCallback(expandBatch);
  };

  expandBatch();
};
```

### Key details

- 10 files per batch, batches separated by `requestIdleCallback` to yield main thread
- 5 concurrent `loadDiff` limit per batch (consistent with current behavior)
- Combined with L3: first batch files in viewport render immediately, later files marked as expanded but `MultiFileDiff` deferred until scrolled into view
- User perception: first few files show diff almost instantly, rest load silently in background
- Collapse All needs no changes — clearing `expandedFiles` Set triggers L3 observer unmount

## Files Changed

- `plugins/review/review-view.tsx` — L1 through L4 changes
- `plugins/git/git-diff-view.tsx` — L1 options sync
- `plugins/review/locales/{en-US,zh-CN}.json` — L2 guard strings
- New: `hooks/useIntersectionObserver.ts` — L3 generic hook

## Performance Detail: Memoize Diff Options

The `options` object passed to `MultiFileDiff` is created inline on every render, causing unnecessary re-renders. Memoize with `useMemo`:

```tsx
const diffOptions = useMemo(
  () => ({
    theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
    diffStyle,
    expandUnchanged: false,
    expansionLineCount: 20,
    tokenizeMaxLineLength: 500,
  }),
  [resolvedTheme, diffStyle],
);
```

## Not Changed

- Backend / main process
- Shared contracts
- `@pierre/diffs` library itself

## Future Considerations

If further optimization is needed, switch from `MultiFileDiff` (takes raw old/new content, computes diff in JS) to `PatchDiff` (takes unified patch string from git, naturally compact). This requires backend API changes to return `git diff` output instead of full file contents.
