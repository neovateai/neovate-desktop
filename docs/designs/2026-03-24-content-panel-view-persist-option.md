# ContentPanelView `persist` Option

**Date:** 2026-03-24
**Branch:** feat/content-panel-tab-persistence

## Problem

All content panel tabs are persisted to storage and restored on next session. Some view types (e.g. search results, transient previews) don't make sense to restore — their state is ephemeral and meaningless after a restart.

Currently there is no way for a plugin to opt out of tab persistence.

## Solution

Add an optional `persist` property to `ContentPanelView`:

```ts
interface ContentPanelView {
  viewType: string;
  name: string | LocalizedString;
  icon?: React.ComponentType<{ className?: string }>;
  singleton?: boolean; // default true
  persist?: boolean; // default true; whether the tab is persisted to storage
  deactivation?: "hidden" | "offscreen" | "activity" | "unmount";
  component: () => Promise<{ default: React.ComponentType }>;
}
```

When `persist` is `false`, tabs of that view type are excluded from storage and will not appear after a restart.

## Design Decisions

### Granularity: view type level (not per-tab instance)

Persistence is a characteristic of the view type itself, not of individual tab instances. A "Search" view is always transient; an "Editor" view is always persistent. This matches the existing pattern of `singleton` — a view-level declaration, not a per-open decision.

### Filter at both save and hydrate

- **Save:** `ContentPanel.flush()` strips `persist: false` tabs before writing to storage. This keeps stored data clean.
- **Hydrate:** `ContentPanel.hydrate()` also filters loaded data. This handles the case where a view changes from `persist: true` to `persist: false` between versions — stale tabs won't leak back into the store.

### activeTabId fallback

If the saved `activeTabId` points to a filtered-out tab, fall back to the **first** remaining tab (or `null` if none left).

### Hydrate write-back

`hydrate()` calls `observe()` before `setState()`, so the store subscription naturally triggers a debounced `flush()` when filtered data differs from the loaded data. No manual dirty marking needed.

### Unknown viewType tabs

`filterPersistable()` only removes tabs whose registered view has `persist: false`. Tabs with unknown/unregistered viewTypes are preserved as-is — this avoids breaking orphan tab handling and is out of scope for this change.

## Files to Change

| File                                                     | Change                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `core/plugin/contributions.ts`                           | Add `persist?: boolean` to `ContentPanelView`               |
| `features/content-panel/content-panel.ts`                | Add `filterPersistable()`, update `flush()` and `hydrate()` |
| `features/content-panel/__tests__/content-panel.test.ts` | Add tests for persist filtering                             |
