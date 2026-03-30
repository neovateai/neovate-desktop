# ContentPanelView `discoverable` Option

**Date:** 2026-03-26
**Branch:** feat/content-panel-ext-no-dropdown

## Problem

Some content panel views are intended to be opened programmatically by plugin
logic (e.g. triggered by an agent action or a sidebar button), not by the user
browsing the new-tab dropdown. Currently all registered views unconditionally
appear in the dropdown, with no way to opt out.

## Solution

Add an optional `discoverable` property to `ContentPanelView`:

```ts
interface ContentPanelView {
  viewType: string;
  name: string | LocalizedString;
  icon?: React.ComponentType<{ className?: string }>;
  singleton?: boolean; // default true
  persist?: boolean; // default true
  discoverable?: boolean; // default true; whether to show in new-tab dropdown
  deactivation?: "hidden" | "offscreen" | "activity" | "unmount";
  component: () => Promise<{ default: React.ComponentType }>;
}
```

When `discoverable` is `false`, the view is excluded from the new-tab dropdown menu.
It can still be opened programmatically via `contentPanel.openView(viewType)`.

## Design Decisions

### Name: `discoverable` (not `showInNewTabMenu`)

`showInNewTabMenu` is long and couples the API to a specific UI element name.
`discoverable` is short, neutral, and consistent with the style of other boolean
flags on the interface (`singleton`, `persist`). The term naturally reads as
"is this view discoverable/discoverable in the UI" without binding to implementation
details.

### Default `true` for backwards compatibility

Existing views continue to appear in the dropdown without any change. Plugins
opt out explicitly by setting `discoverable: false`.

### Filter in `NewTabMenu`, not in contributions registry

The `discoverable` flag is a UI-layer concern — it describes how a view is surfaced
to the user, not whether it is registered. Filtering happens in
`NewTabMenu` at render time, keeping the full view registry available for
programmatic use.

## Files Changed

| File                                                 | Change                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `core/plugin/contributions.ts`                       | Add `discoverable?: boolean` to `ContentPanelView` with JSDoc |
| `features/content-panel/components/new-tab-menu.tsx` | Filter `v.discoverable !== false`                             |
