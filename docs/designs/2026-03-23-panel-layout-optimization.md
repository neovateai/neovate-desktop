# Panel Layout Optimization Design

**Date:** 2026-03-23
**Issue:** Panel resize behavior and layout performance optimization
**Branch:** fix/panelresize
**Status:** Implemented

## Requirement

This design covers multiple panel layout optimizations:

1. **Dynamic Grid Layout**: Dynamically adjust grid columns based on contentPanel state
2. **Priority-based Resize**: When contentPanel is expanded, it absorbs window resize changes first
3. **Layout Animation**: Add smooth CSS transitions for layout changes
4. **Width Preference**: Preserve user's manual width preferences across sessions
5. **Chat Panel Fixed Width**: When contentPanel is expanded, chatPanel uses fixed width instead of flex

## Implementation Summary

The solution required changes across multiple files:

1. **Dynamic grid template columns** in `constants.ts`
2. **Priority-based shrink logic** in `layout-coordinator.ts`
3. **Active window delta adjustment** in `layout-coordinator.ts`
4. **Width preference tracking** in `store.ts` and `types.ts`
5. **Layout transitions** in `app-layout.tsx`
6. **Hook updates** in `hooks.ts`

## Files Modified

| File                    | Changes                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `constants.ts`          | Added `getGridTemplateColumns()` function                                                    |
| `layout-coordinator.ts` | Added `getShrinkPriority()`, `adjustPanelsForWindowDelta()`, `setPanelWidthWithPreference()` |
| `hooks.ts`              | Replaced `useShrinkPanelsOnWindowResize` with `useAdjustPanelsOnWindowResize`                |
| `store.ts`              | Added `preferredWidth` handling, special contentPanel expand/collapse logic                  |
| `types.ts`              | Added `preferredWidth` field to `PanelState`                                                 |
| `app-layout.tsx`        | Added dynamic grid columns, CSS transitions, fixed chatPanel width                           |
| `content-panel.tsx`     | Simplified, removed motion animation                                                         |
| `panel-descriptors.ts`  | Updated contentPanel min/max/defaultWidth values                                             |

## Implementation Details

### 1. Dynamic Grid Template Columns

```ts
export function getGridTemplateColumns(contentPanelExpanded: boolean): string {
  // Column structure (8 columns):
  // 1: primarySidebar, 2: sep1, 3: chatPanel, 4: sep2, 5: contentPanel, 6: sep3, 7: secondarySidebar, 8: activityBar
  return contentPanelExpanded
    ? "auto auto auto auto 1fr auto auto auto" // contentPanel gets 1fr
    : "auto auto 1fr 0 0 auto auto auto"; // chatPanel gets 1fr
}
```

When contentPanel is collapsed, columns 4-5 collapse to 0, allowing chatPanel to naturally fill the space with `1fr`.

### 2. Dynamic Shrink Priority

```ts
function getShrinkPriority(descriptor: PanelDescriptor, panels: PanelMap): number {
  // contentPanel: highest priority when expanded, ignored when collapsed
  if (descriptor.id === "contentPanel") {
    return panels.contentPanel.collapsed ? -1 : 4;
  }

  // chatPanel: high priority (absorbs changes when contentPanel is closed)
  if (descriptor.id === "chatPanel") {
    return 3;
  }

  // Other panels: use static priority from descriptor
  return descriptor.overflow.priority;
}
```

When layout overflows, panels shrink in priority order:

- contentPanel (priority 4 when expanded)
- chatPanel (priority 3)
- secondarySidebar (priority 1)
- primarySidebar (priority 0)

### 3. Active Window Delta Adjustment

```ts
export function adjustPanelsForWindowDelta(
  panels: PanelMap,
  previousWidth: number,
  currentWidth: number,
): PanelMap {
  const delta = currentWidth - previousWidth;
  if (delta === 0) return panels;

  // If contentPanel is collapsed, chatPanel absorbs change naturally (flex-1)
  if (panels.contentPanel.collapsed) {
    if (delta < 0) {
      return shrinkPanelsToFit(panels, currentWidth);
    }
    return panels;
  }

  // contentPanel is expanded - let it absorb the window change
  const contentPanelDesc = getDescriptor("contentPanel");
  const contentPanel = panels.contentPanel;

  if (delta > 0) {
    // Window grew: expand contentPanel first
    const growRoom = contentPanelDesc.max - contentPanel.width;
    const grow = Math.min(delta, growRoom);
    if (grow > 0) {
      result = setPanelWidth(result, "contentPanel", contentPanel.width + grow);
    }
  } else {
    // Window shrank: shrink contentPanel first
    const shrinkRoom = contentPanel.width - contentPanelDesc.min;
    const shrink = Math.min(-delta, shrinkRoom);
    if (shrink > 0) {
      result = setPanelWidth(result, "contentPanel", contentPanel.width - shrink);
    }
    // If contentPanel can't absorb all, use shrinkPanelsToFit for the rest
    const remainingDelta = -delta - shrink;
    if (remainingDelta > 0) {
      result = shrinkPanelsToFit(result, currentWidth);
    }
  }

  return result;
}
```

### 4. Width Preference Tracking

Added `preferredWidth` field to track user's manual width settings:

```ts
type PanelState = {
  width: number;
  /** User's preferred width (preserved across window resizes). */
  preferredWidth?: number;
  collapsed: boolean;
  activeView?: string;
};
```

When user manually resizes a panel, the width is saved as `preferredWidth`. When opening a panel, it uses `preferredWidth` if available.

### 5. Layout Transitions

Added CSS transitions for smooth layout changes:

```tsx
style={{
  ...APP_LAYOUT_GRID,
  gridTemplateColumns: getGridTemplateColumns(contentPanelExpanded),
  transition: "grid-template-columns 300ms ease-in-out",
  willChange: "grid-template-columns",
}}
```

### 6. Chat Panel Fixed Width

When contentPanel is expanded, chatPanel uses fixed width instead of flex:

```tsx
const contentPanelExpanded = useLayoutStore((s) => !s.panels.contentPanel?.collapsed);
const chatPanelWidth = useLayoutStore((s) => s.panels.chatPanel?.width);

style={{
  gridArea: APP_LAYOUT_GRID_AREA.chatPanel,
  width: contentPanelExpanded ? chatPanelWidth : undefined,
  contain: "layout",
}}
```

### 7. Special Panel Expand/Collapse Handling

When collapsing contentPanel, save chatPanel's current width as preferredWidth:

```ts
if (id === "contentPanel") {
  if (!panels.contentPanel.collapsed) {
    // Collapse contentPanel: save chatPanel width before collapsing
    const chatPanelEl = document.querySelector('[data-slot="chat-panel"]');
    let chatWidth = panels.chatPanel.width;
    if (chatPanelEl) {
      chatWidth = chatPanelEl.getBoundingClientRect().width;
    }
    // Save chatPanel's current width as its preferredWidth
    const updatedPanels = {
      ...panels,
      chatPanel: { ...panels.chatPanel, preferredWidth: chatWidth },
      contentPanel: { ...panels.contentPanel, collapsed: true },
    };
    set({ panels: updatedPanels });
  } else {
    // Expand contentPanel: restore chatPanel to preferred width
    const chatPanelWidth = panels.chatPanel.preferredWidth ?? APP_LAYOUT_CHAT_PANEL_MIN_WIDTH;
    const updatedPanels = {
      ...panels,
      chatPanel: { ...panels.chatPanel, width: chatPanelWidth },
      contentPanel: { ...panels.contentPanel, collapsed: false, width: 0 },
    };
    set({ panels: updatedPanels });
  }
}
```

### 8. Panel Descriptor Changes

Updated contentPanel configuration:

```ts
{
  id: "contentPanel",
  min: 0,           // Changed from 300
  max: Infinity,
  defaultWidth: 0,  // Changed from 300
  defaultCollapsed: true,
  open: open.restore(),  // Changed from open.splitWith(300, 0.5)
  overflow: overflow.shrinkable(0),  // Changed from overflow.shrinkable(2)
}
```

Also updated chatPanel minimum width:

```ts
export const APP_LAYOUT_CHAT_PANEL_MIN_WIDTH = 320; // Changed from 460
```

## Behavior Summary

| Scenario                            | Before Change              | After Change                           |
| ----------------------------------- | -------------------------- | -------------------------------------- |
| contentPanel expanded, shrink win   | chatPanel shrinks (flex-1) | contentPanel shrinks first             |
| contentPanel expanded, enlarge win  | chatPanel expands (flex-1) | contentPanel expands first (up to max) |
| contentPanel collapsed, shrink win  | chatPanel shrinks          | chatPanel shrinks (unchanged)          |
| contentPanel collapsed, enlarge win | chatPanel expands          | chatPanel expands (unchanged)          |
| Panel expand/collapse               | Basic animation            | Smooth CSS transition                  |
| Manual resize                       | Lost on toggle             | Preserved via preferredWidth           |

## Edge Cases

- **contentPanel at minimum width**: Falls through to chatPanel naturally
- **contentPanel at maximum width**: Falls through to chatPanel naturally
- **Both at limits**: Continues to other panels via `shrinkPanelsToFit`
- **Window resize during panel drag**: Handled by debouncing and RAF
- **preferredWidth invalid**: Falls back to default values

## Performance Considerations

1. **CSS `contain: layout`**: Added to chatPanel and contentPanel to reduce layout recalculation scope
2. **`willChange`**: Hint to browser to optimize for grid column changes
3. **RequestAnimationFrame**: Used for chatPanel width sync to avoid layout thrashing
4. **Removed Motion Animation**: Replaced motion/react with CSS transitions for better performance
