---
title: "feat: Add Terminal toggle to secondary titlebar"
type: feat
status: active
date: 2026-04-07
origin: docs/brainstorms/2026-04-07-terminal-titlebar-icon-brainstorm.md
---

# feat: Add Terminal toggle to secondary titlebar

## Overview

Add a Terminal toggle button to the secondary titlebar as a plugin-contributed `secondaryTitlebarItem`. Clicking toggles the terminal content panel; the button shows an active state when a terminal view is active. (see brainstorm: docs/brainstorms/2026-04-07-terminal-titlebar-icon-brainstorm.md)

## Acceptance Criteria

- [x] Terminal icon (`ComputerTerminal01Icon`) appears in the secondary titlebar plugin items area
- [x] Clicking the icon calls `contentPanel.toggleView("terminal")` — creates a terminal if none exists, activates if backgrounded, collapses if already active
- [x] Button shows visual active state (`bg-accent`) when a terminal tab is active and the content panel is expanded
- [x] Button shows default state when no terminal is active or panel is collapsed
- [x] Tooltip displays "Terminal" (en-US) / "终端" (zh-CN)
- [ ] Passes `bun ready` (typecheck + lint + format + tests)

## Implementation

### 1. Create button component

**New file:** `src/renderer/src/plugins/terminal/terminal-titlebar-button.tsx`

```tsx
// Pattern follows demo-window button components
// - useRendererApp() for app access
// - useContentPanelStore() for active state detection
// - useLayoutStore() for panel collapsed state
// - <Button variant="ghost" size="icon-sm" className="size-7">
// - Active state: cn("hover:bg-accent", isActive && "bg-accent")
// - Icon: ComputerTerminal01Icon size={16} strokeWidth={1.5}
// - onClick: app.workbench.contentPanel.toggleView("terminal")
```

Active state logic:

- Read `activeTabId` from content panel store for the current project
- Check if that tab's `viewType === "terminal"`
- Read `contentPanel.collapsed` from layout store
- `isActive = isTerminalActive && !collapsed`

### 2. Register in terminal plugin

**Edit file:** `src/renderer/src/plugins/terminal/index.tsx`

Add `secondaryTitlebarItems` to the return value of `configViewContributions()`:

```tsx
secondaryTitlebarItems: [
  {
    id: "terminal.toggle",
    tooltip: { "en-US": "Terminal", "zh-CN": "终端" },
    order: 100,
    component: () => import("./terminal-titlebar-button"),
  },
],
```

No other files need changes — the secondary titlebar already renders all plugin-contributed items automatically.

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-04-07-terminal-titlebar-icon-brainstorm.md](../brainstorms/2026-04-07-terminal-titlebar-icon-brainstorm.md)
- Button pattern: `src/renderer/src/plugins/demo-window/open-demo-window-button.tsx`
- Active state pattern: `src/renderer/src/components/app-layout/app-layout.tsx:305-325` (`ContentPanelToggle`)
- Toggle API: `src/renderer/src/features/content-panel/content-panel.ts:141-162`
- Plugin types: `src/renderer/src/core/plugin/types.ts` (`TitlebarItem`, `RendererPluginHooks`)
