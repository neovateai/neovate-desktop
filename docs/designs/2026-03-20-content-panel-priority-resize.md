# Content Panel Priority Resize Design

**Date:** 2026-03-20
**Issue:** Panel resize behavior optimization
**Branch:** fix/panelresize
**Status:** Implemented

## Requirement

When the user drags the window edge to resize, the layout should respond intelligently based on which panels are visible:

1. **If contentPanel is expanded:** Window resize should primarily affect contentPanel width
2. **If contentPanel is collapsed:** Window resize should affect chatPanel width

This creates a more predictable UX where the "auxiliary" panel (contentPanel) absorbs size changes when available, preserving the main chat area when possible.

## Implementation Summary

The solution required two changes:

1. **Dynamic priority in `shrinkPanelsToFit`**: When there's overflow, contentPanel shrinks before chatPanel
2. **Active contentPanel adjustment in `adjustPanelsForWindowDelta`**: Track window delta and actively grow/shrink contentPanel

### Why Both Changes Were Needed

The original `shrinkPanelsToFit` only handled overflow situations. But the core problem was that chatPanel is CSS Grid `1fr` (flex-1), so it automatically responds to window changes before any JS logic runs.

The new `adjustPanelsForWindowDelta` function actively tracks window width changes and adjusts contentPanel width accordingly, ensuring that window delta is absorbed by contentPanel first.

## Files Modified

1. `layout-coordinator.ts`: Added `getShrinkPriority` and `adjustPanelsForWindowDelta`
2. `hooks.ts`: Replaced `useShrinkPanelsOnWindowResize` with `useAdjustPanelsOnWindowResize`

## Implementation Details

### 1. Dynamic Shrink Priority

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

### 2. Active Window Delta Adjustment

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
    const grow = Math.min(delta, contentPanelDesc.max - contentPanel.width);
    return setPanelWidth(panels, "contentPanel", contentPanel.width + grow);
  } else {
    // Window shrank: shrink contentPanel first
    const shrink = Math.min(-delta, contentPanel.width - contentPanelDesc.min);
    let result = setPanelWidth(panels, "contentPanel", contentPanel.width - shrink);

    // If contentPanel can't absorb all, use shrinkPanelsToFit for the rest
    if (-delta > shrink) {
      result = shrinkPanelsToFit(result, currentWidth);
    }
    return result;
  }
}
```

### 3. Hook Update

```ts
function useAdjustPanelsOnWindowResize() {
  const previousWidthRef = useRef<number>(window.innerWidth);

  useEffect(() => {
    const adjust = () => {
      const { panels } = layoutStore.getState();
      const currentWidth = window.innerWidth;
      const previousWidth = previousWidthRef.current;

      const newPanels = adjustPanelsForWindowDelta(panels, previousWidth, currentWidth);
      if (newPanels !== panels) {
        layoutStore.setState({ panels: newPanels });
      }

      previousWidthRef.current = currentWidth;
      // ... sync chatPanel width from DOM
    };

    // ... event listener setup
  }, []);
}
```

## Behavior Summary

| Scenario                            | Before Change              | After Change                           |
| ----------------------------------- | -------------------------- | -------------------------------------- |
| contentPanel expanded, shrink win   | chatPanel shrinks (flex-1) | contentPanel shrinks first             |
| contentPanel expanded, enlarge win  | chatPanel expands (flex-1) | contentPanel expands first (up to max) |
| contentPanel collapsed, shrink win  | chatPanel shrinks          | chatPanel shrinks (unchanged)          |
| contentPanel collapsed, enlarge win | chatPanel expands          | chatPanel expands (unchanged)          |

## Edge Cases

- **contentPanel at minimum width**: Falls through to chatPanel naturally
- **contentPanel at maximum width**: Falls through to chatPanel naturally
- **Both at limits**: Continues to other panels via `shrinkPanelsToFit`

## Testing

See `layout-coordinator.test.ts` for unit tests covering:

- Dynamic priority calculation
- contentPanel shrinking before chatPanel
- chatPanel shrinking when contentPanel is collapsed
- Fall-through when contentPanel hits minimum
