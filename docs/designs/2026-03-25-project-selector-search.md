# Project Selector Search

## 1. Background

The project selector popup currently lists all projects without any filtering. As users accumulate projects, finding the right one becomes tedious. Adding a search input that auto-focuses on open lets users quickly filter and switch projects.

## 2. Requirements Summary

**Goal:** Add a search/filter input to the project selector popup that auto-focuses on open, allowing users to quickly find projects by name or path.

**Scope:**

- In scope: Search input in project selector popup, auto-focus, filter by name+path, keyboard navigation
- Out of scope: Multi-project accordion list search, fuzzy matching, search persistence

## 3. Acceptance Criteria

1. When the project selector popup opens, a search input is visible and focused
2. Typing filters the project list by matching name or path (case-insensitive)
3. "Open Project" button remains always visible regardless of filter
4. All existing functionality preserved: active check, delete, stale projects, both variants (menu/select)
5. Empty search shows all projects (current behavior)
6. Arrow keys navigate filtered results, Enter selects highlighted project

## 4. Problem Analysis

Current state: `ProjectSelector` uses `@base-ui/react` Menu, which captures keyboard events for item navigation. Adding a text input inside a Menu conflicts with this keyboard handling.

- **Approach A: Keep Menu, add input** -> Menu swallows keyboard events before they reach the input. Would require hacking around base-ui internals.
- **Approach B: Switch to Popover with custom list** -> Clean separation. Popover has no keyboard interception. Branch-switcher already proves this pattern works.
- **Chosen approach: B (Popover)** -> Consistent with existing codebase pattern, no hacks needed.

## 5. Decision Log

**1. Which popup primitive?**

- Options: A) Keep @base-ui Menu . B) Switch to Popover . C) Use Combobox
- Decision: **B) Popover** -- Menu captures keyboard events, conflicts with input. Popover is simpler and branch-switcher proves the pattern.

**2. What to filter on?**

- Options: A) Name only . B) Path only . C) Both name+path . D) Fuzzy match
- Decision: **C) Both name+path** -- Simple case-insensitive `includes()`. Users may remember either. Fuzzy is YAGNI.

**3. Keyboard navigation?**

- Options: A) Custom highlightIndex state . B) base-ui built-in
- Decision: **A) Custom** -- Following branch-switcher pattern. ArrowUp/Down to move highlight, Enter to select.

**4. "Open Project" button in keyboard loop?**

- Options: A) Include in arrow-key navigation . B) Exclude, clickable only
- Decision: **B) Exclude** -- Consistent with branch-switcher's footer button pattern. Keeps keyboard nav simple.

**5. Escape behavior?**

- Options: A) Clear search first, then close . B) Always close immediately
- Decision: **B) Always close** -- Default Popover behavior. No special handling needed.

**6. PopoverPopup padding?**

- Override default `py-4` padding via `viewportClassName` to manage padding per-section manually.

## 6. Design

Replace Menu-based ProjectSelector with Popover-based component:

```
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger>  (same trigger renders as before - two variants)
  <PopoverPopup viewportClassName="py-1 ...">
    <div onKeyDown={handleKeyDown}>
      <input autoFocus />           <- search, always visible, auto-focused
      <OpenProject button>          <- always visible, outside keyboard loop
      <separator>
      <filtered project list>       <- scrollable, keyboard navigable
    </div>
  </PopoverPopup>
</Popover>
```

**State:** Local `useState` for `search`, `highlightIndex`, `open`. Reset both `search` and `highlightIndex` when `open` becomes true.

**Filtering:** `projects.filter(p => lower(p.name).includes(q) || lower(p.path).includes(q))`

**Keyboard:** `onKeyDown` on wrapper div -- ArrowDown/Up move highlight, Enter selects, Escape closes (default).

**Scroll:** Highlighted item scrolled into view via `data-index` attribute, same as branch-switcher.

## 7. Files Changed

- `packages/desktop/src/renderer/src/features/project/components/project-selector.tsx` -- Rewrite from Menu to Popover with search
- `packages/desktop/src/renderer/src/locales/en-US.json` -- Add `project.searchPlaceholder`
- `packages/desktop/src/renderer/src/locales/zh-CN.json` -- Add `project.searchPlaceholder`

## 8. Verification

1. [AC1] Open project selector -> search input is visible and focused
2. [AC2] Type a query -> list filters by name and path match
3. [AC3] Type a query that matches no projects -> "Open Project" button still visible
4. [AC4] Click delete on a project, check active indicator, test stale projects, test both menu/select variants
5. [AC5] Clear search input -> all projects shown
6. [AC6] Use arrow keys to navigate, press Enter to select -> correct project switches
