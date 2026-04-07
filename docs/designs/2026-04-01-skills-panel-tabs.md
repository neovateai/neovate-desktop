# Skills Panel Tab Refactor

## Goal

Align the skills management panel with the plugins management panel by introducing tabs (Discover / Installed) instead of stacked sections. Rename "Recommended" to "Discover".

## Approach

Mirror the `plugins-panel.tsx` pattern: a thin orchestrator that owns data fetching and search filtering, delegating rendering to dedicated tab components.

## Files

### `skills-panel.tsx` — Orchestrator (~120 lines)

Refactored from the current 490-line monolith.

**Owns:**

- All data fetching (`installed`, `recommended`, `updates`) via `fetchData` / `refreshAfterMutation`
- `searchQuery` state
- `activeTab` state (`"discover"` | `"installed"`)
- Filtering logic (produces `filteredRecommended` and `filteredInstalled`)

**Renders:**

```
Header: Wand2 icon + "Skills" title
Toolbar: [Search input] [+ Add] [Refresh]
Tabs (underline variant):
  [Download] Discover  |  [Wand2] Installed (badge: count)

  TabsContent "discover" -> <SkillDiscoverTab />
  TabsContent "installed" -> <SkillInstalledTab />

Add Modal (triggered by + button)
```

No global error banner — errors are passed to respective tabs and rendered in context.

The `+ Add` button stays in the toolbar (skills-specific) since it's a global action for installing from URL/path.

### `skill-discover-tab.tsx` — New file (~130 lines)

**Props:**

```ts
interface SkillDiscoverTabProps {
  skills: RecommendedSkill[];
  error: string | null; // recommendedError from orchestrator
  projects: Project[];
  onFindInstalled: (skillName: string) => SkillMeta | undefined; // lookup callback, avoids leaking full installed list
  onRefresh: () => Promise<void>;
  onInstall: (
    skill: RecommendedSkill,
    scope: "global" | "project",
    projectPath?: string,
  ) => Promise<void>;
}
```

**Owns locally:**

- `selectedRecommended` — opens `SkillDetailModal` for recommended skill
- `selectedSkill` — opens `SkillDetailModal` for installed skill (when clicking an already-installed recommended)

**Renders:**

- Error state with retry when `error` is set
- Empty state when `skills.length === 0`
- 3-column grid of recommended skill cards (installed items at reduced opacity)
- Quick install button (Download icon) on uninstalled cards
- "Installed" badge on already-installed cards
- `SkillDetailModal` for both recommended and installed skill clicks

### `skill-installed-tab.tsx` — New file (~130 lines)

**Props:**

```ts
interface SkillInstalledTabProps {
  skills: SkillMeta[];
  updates: SkillUpdate[];
  error: string | null; // installed list fetch error from orchestrator
  projects: Project[];
  searchQuery: string; // passed through so empty state can distinguish "no results" vs "none installed"
  onRefresh: () => Promise<void>;
}
```

**Owns locally:**

- `scopeFilter` — owned entirely here since no other tab needs it
- `selectedSkill` — opens `SkillDetailModal`
- `togglingSkill` — tracks which skill is being toggled
- Derives `filteredSkills` from `skills` + `scopeFilter` internally

**Renders:**

- Error state with retry when `error` is set
- Scope filter dropdown (All / Global / per-project) in a header row
- Empty state when no skills match
- 3-column grid of installed skill cards with toggle switches
- Scope/version/update badges
- `SkillDetailModal` for detail view

The scope filter is owned by this tab (not the orchestrator) since no other tab needs it.

### Unchanged files

- `skill-detail-modal.tsx` — already handles both installed and recommended
- `skill-add-modal.tsx` — no changes needed

## Data flow

```
skills-panel.tsx (fetches all data, filters recommended by search)
  +-- SkillDiscoverTab (filteredRecommended, recommendedError, onFindInstalled callback)
  +-- SkillInstalledTab (installed, error, updates — owns scopeFilter + derives filteredSkills internally)
```

Note: The orchestrator filters recommended skills by search query before passing to DiscoverTab. For InstalledTab, the full installed list is passed and the tab filters by scope internally (the orchestrator still filters by search query before passing).

## Reference

Modeled after `src/renderer/src/features/claude-code-plugins/components/plugins-panel.tsx` and its tab components.
