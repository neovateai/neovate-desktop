# Skills Settings Page Improvements

**Date**: 2026-03-14
**Status**: Approved

## Overview

Improve the skills settings page with i18n support, UI fixes, and UX tweaks.

## Changes

### 1. Add i18n for all hardcoded strings

Add ~30 new translation keys to `en-US.json` and `zh-CN.json`. Replace all hardcoded English strings with `t()` calls in:

**`skills-panel.tsx`**:

- `"Search skills..."` (placeholder)
- `"Installed (N)"` section heading
- `"All"`, `"Global"` (select options)
- `"No skills matching ..."` / `"No skills installed. Browse recommended skills below or add from URL."`
- `"global"` (scope badge)
- `"Recommended"` / `"Recommended (N)"` section heading
- `"Retry"` (recommended error)
- `"Installed"` (badge on recommended items)
- `"Install"` (button)
- `"Add from URL/package..."` (button)

**`skill-detail-modal.tsx`**:

- `"Enabled"` / `"Disabled"`
- `"Global"` / `"Project"` (scope badge)
- `"Source: ..."` label
- Frontmatter labels: `"Model invocation"`, `"User invocable"`, `"Allowed tools"`, `"Context"`, `"Model"`, `"Arguments"`
- `"Loading content..."`
- `"Path: ..."`
- `"Open Folder"`, `"Delete skill directory?"`, `"Cancel"`, `"Remove"`, `"Uninstall"`
- `"Install"` / `"Installing..."`

**`skill-add-modal.tsx`**:

- `"Add Skill"` (title)
- `"Install skills from a Git repository, npm package, or local path."` (description)
- Input placeholder, `"Examples:"`
- `"Fetching skills from source..."`
- `"Found N skill(s) in source:"`
- `"Install to:"` label
- `"Installing skills..."`
- `"Cancel"`, `"Next"`
- `"N of M selected"`, `"Install (N)"`

### 2. Fix search icon not rendering

**Root cause**: The `<Search>` icon is absolutely positioned in the parent `<div className="relative">`, but the `<Input>` component renders an outer `<span>` with `relative` + `bg-background` that paints over the icon due to CSS stacking order.

**Fix**: Add `z-10` to the Search icon className.

**File**: `skills-panel.tsx` line 174

```diff
- <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
+ <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10" />
```

### 3. Installed scope select defaults

**a) Display label not value**: Verify base-ui `SelectValue` renders item children (label) not raw value. If it shows raw values, add explicit label mapping.

**b) Default to "global"**: Change initial `scopeFilter` state from `"all"` to `"global"`.

**File**: `skills-panel.tsx` line 35

```diff
- const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
+ const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("global");
```

### 4. Skill detail modal layout

**a) Move enable toggle under description**: Move the enabled/disabled switch from the header row (next to title) to below `<DialogDescription>`, still inside `<DialogHeader>`.

**b) Show full path**: Change path display from `truncate` to `break-all` so the full directory path is visible with wrapping.

**File**: `skill-detail-modal.tsx` line 213

```diff
- <div className="mt-3 text-xs text-muted-foreground truncate">Path: {skill.dirPath}</div>
+ <div className="mt-3 text-xs text-muted-foreground break-all">Path: {skill.dirPath}</div>
```

### 5. Show descriptions on installed skill items

Currently installed skill list items only show name + badges + toggle. Add a one-line truncated description below the name, matching the style used for recommended items.

**File**: `skills-panel.tsx` lines 234-248

Add after the skill name/badges row:

```tsx
<p className="text-xs text-muted-foreground truncate">{skill.description}</p>
```

### 6. Move "Add from URL/package" button to header

Move the button from the bottom of the page (after recommended section) to the header row, next to the refresh button. Makes it more discoverable when the skill list is long.

**File**: `skills-panel.tsx`

Move from line 328 into the header `<div className="flex items-center gap-2">` at line 165.

### 7. Show update availability indicators

The backend already exposes `checkUpdates()` and `update()` APIs. Add:

- Call `checkUpdates()` alongside initial data fetch
- Show an update badge/icon on skills that have updates available
- Add an "Update" button in the skill detail modal when an update is available

**Files**: `skills-panel.tsx`, `skill-detail-modal.tsx`

## Files Modified

- `packages/desktop/src/renderer/src/features/settings/components/panels/skills-panel.tsx`
- `packages/desktop/src/renderer/src/features/settings/components/panels/skill-detail-modal.tsx`
- `packages/desktop/src/renderer/src/features/settings/components/panels/skill-add-modal.tsx`
- `packages/desktop/src/renderer/src/locales/en-US.json`
- `packages/desktop/src/renderer/src/locales/zh-CN.json`
