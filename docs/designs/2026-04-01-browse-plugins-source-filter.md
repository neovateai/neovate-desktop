# Browse Plugins Button with Source Filter

## Summary

Add a "Browse Plugins" button to each marketplace row in the Sources tab. Clicking it switches to the Discover tab with a visible source filter applied, showing only plugins from that marketplace.

## Motivation

Users managing multiple plugin sources need a quick way to see what plugins a specific source provides without manually switching tabs and scanning marketplace badges.

## Design

### 1. Sources tab — "Browse Plugins" button per row (`sources-tab.tsx`)

Add a small outlined button with text and `ExternalLink` icon before the existing Refresh button in each marketplace row's action area.

- Accepts a new `onBrowse: (name: string) => void` prop
- Button style: `variant="outline" size="sm"` with `ExternalLink` icon + "Browse" text
- Button placement: `[Browse ↗] [Refresh] [Delete]`

```
┌─ Sources ──────────────────────────────────────────────┐
│ 2 sources                              [+ Add Source]  │
│                                                        │
│ ┌────────────────────────────────────────────────────┐ │
│ │ official                                           │ │
│ │ The official Claude Code plugins                   │ │
│ │ git · 12 plugins · Updated Today                   │ │
│ │                      [Browse ↗] [Refresh] [Delete] │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### 2. Controlled tabs in PluginsPanel (`plugins-panel.tsx`)

Currently `<Tabs defaultValue="discover">` is uncontrolled. Make it controlled:

- Add `activeTab` state (default: `"discover"`)
- Add `sourceFilter` state (`string | null`, default: `null`)
- Pass `onBrowse` callback to SourcesTab that sets `sourceFilter` and switches `activeTab` to `"discover"`
- Pass `sourceFilter` and `onClearSourceFilter` to DiscoverTab
- Auto-clear `sourceFilter` when the user manually switches away from the Discover tab (in `onValueChange`), so stale filters don't persist

### 3. Source filtering in PluginsPanel (`plugins-panel.tsx`)

Source filtering is applied in `filteredDiscovered` memo (alongside the existing `searchQuery` filter) so `DiscoverTab` stays a pure display component. Both filters compose: source filter AND text search.

### 4. Discover tab — filter chip (`discover-tab.tsx`)

- Accept `sourceFilter: string | null` and `onClearSourceFilter: () => void` props
- Render a dismissible chip above the plugin grid when `sourceFilter` is set:
  ```
  Source: [official x]
  ```
- Clicking x calls `onClearSourceFilter()` which sets `sourceFilter` back to `null`

## Data Flow

```
SourcesTab                    PluginsPanel                 DiscoverTab
   │                              │                            │
   │ onBrowse("official") ──────> │ setActiveTab("discover")   │
   │                              │ setSourceFilter("official")│
   │                              │ ───────────────────────────>
   │                              │   sourceFilter="official"  │
   │                              │                            │
   │                              │ <───────────────────────────
   │                              │   onClearSourceFilter()    │
   │                              │ setSourceFilter(null)      │
```

## Files Changed

| File                | Change                                                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins-panel.tsx` | Make `Tabs` controlled. Add `activeTab` and `sourceFilter` state. Auto-clear `sourceFilter` on manual tab switch. Pass `onBrowse` to SourcesTab, pass `sourceFilter`/`onClearSourceFilter` to DiscoverTab. |
| `sources-tab.tsx`   | Accept `onBrowse` prop. Add small outlined button with text (`ExternalLink` icon + "Browse") before refresh button.                                                                                        |
| `discover-tab.tsx`  | Accept `sourceFilter` and `onClearSourceFilter` props. Show dismissible filter chip. Filter plugins by marketplace name.                                                                                   |

## Out of Scope

- No dropdown/select filter on the Discover tab itself (YAGNI)
- No URL/routing changes (panel state is already in-memory)
- No new store or persistence (filter is ephemeral UI state)
