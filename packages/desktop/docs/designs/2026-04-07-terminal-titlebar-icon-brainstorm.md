---
date: 2026-04-07
topic: terminal-titlebar-icon
---

# Terminal Icon in Secondary Titlebar

## What We're Building

Add a Terminal toggle button to the secondary titlebar, registered as a plugin-contributed `secondaryTitlebarItem` from the existing terminal renderer plugin. Clicking the button calls `toggleView("terminal")` — opening a new terminal tab and expanding the content panel if none exists, or collapsing the panel if the terminal is already the active view. The button displays a visual active state when a terminal view is currently active.

## Why This Approach

The secondary titlebar already supports plugin-contributed items via `secondaryTitlebarItems`, and the terminal plugin already registers a `contentPanelView`. Adding a titlebar item to the same plugin is the simplest path — no new infrastructure needed, just one more contribution from an existing plugin.

## Key Decisions

- **Plugin-contributed item**: Register via `secondaryTitlebarItems` in `src/renderer/src/plugins/terminal/index.tsx`, same mechanism as demo-window items. No changes to the titlebar component itself.
- **Toggle behavior**: `contentPanel.toggleView("terminal")` — creates terminal if none open, activates if backgrounded, collapses panel if already active.
- **Active state**: Read from content panel store to determine if the active view is a terminal. Apply visual distinction (e.g. highlight color or background) matching existing titlebar toggle patterns like `ContentPanelToggle`.
- **Icon**: Reuse `ComputerTerminal01Icon` from `@hugeicons/core-free-icons`, consistent with the terminal content panel view.

## Open Questions

- Exact active state styling — should follow whatever pattern `ContentPanelToggle` uses for its active/inactive states.

## Next Steps

-> `/ce:plan` for implementation details
