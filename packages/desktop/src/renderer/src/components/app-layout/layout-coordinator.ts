import type { PanelDescriptor, PanelId, PanelMap, LayoutContext } from "./types";

import { APP_LAYOUT_FIXED_WIDTH, APP_LAYOUT_RESIZE_HANDLE_WIDTH, PANEL_ORDER } from "./constants";
import { getDescriptor, PANEL_DESCRIPTORS } from "./panel-descriptors";

// ---------------------------------------------------------------------------
// Separator visibility — shared between renderer and solver
// ---------------------------------------------------------------------------

/**
 * Whether a separator is visible. A handle appears between each pair of
 * adjacent *expanded* panels; when a middle panel is collapsed the handle
 * collapses with it and the flanking handle "jumps" to bridge the gap.
 *
 * The rule: separator `i` is visible iff
 *   1. The panel to its right (PANEL_ORDER[i+1]) is expanded, AND
 *   2. It is the closest separator to the nearest expanded panel on the left.
 */
export function isSeparatorVisible(panels: PanelMap, separatorIndex: number): boolean {
  const rightId = PANEL_ORDER[separatorIndex + 1];
  if (panels[rightId]?.collapsed) return false;

  for (let i = separatorIndex; i >= 0; i--) {
    if (!panels[PANEL_ORDER[i]]?.collapsed) {
      const rightPanelIndex = PANEL_ORDER.indexOf(rightId);
      return separatorIndex === rightPanelIndex - 1;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Panel map helpers — immutable updates without spread noise
// ---------------------------------------------------------------------------

export function setPanelWidth(panels: PanelMap, id: PanelId, width: number): PanelMap {
  return { ...panels, [id]: { ...panels[id], width } };
}

/** Set panel width and update preferredWidth (user's manual preference). */
function setPanelWidthWithPreference(panels: PanelMap, id: PanelId, width: number): PanelMap {
  return { ...panels, [id]: { ...panels[id], width, preferredWidth: width } };
}

function setPanelCollapsed(panels: PanelMap, id: PanelId, collapsed: boolean): PanelMap {
  return { ...panels, [id]: { ...panels[id], collapsed } };
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

function expandedDescriptors(panels: PanelMap) {
  return PANEL_DESCRIPTORS.filter((descriptor) => !panels[descriptor.id].collapsed);
}

/** Count visible resize handles using the shared visibility rule. */
function countVisibleHandles(panels: PanelMap): number {
  let count = 0;
  for (let i = 0; i < PANEL_ORDER.length - 1; i++) {
    if (isSeparatorVisible(panels, i)) count++;
  }
  return count;
}

/** Total width consumed by fixed chrome, all expanded panels, and visible handles. */
export function computeTotalWidth(panels: PanelMap): number {
  const panelWidth = expandedDescriptors(panels).reduce(
    (total, descriptor) => total + panels[descriptor.id].width,
    0,
  );
  return (
    APP_LAYOUT_FIXED_WIDTH +
    panelWidth +
    countVisibleHandles(panels) * APP_LAYOUT_RESIZE_HANDLE_WIDTH
  );
}

/** Minimum window width so every expanded panel can sit at its min width. */
export function computeMinWindowWidth(panels: PanelMap): number {
  const minPanelWidth = expandedDescriptors(panels).reduce(
    (total, descriptor) => total + descriptor.min,
    0,
  );
  return (
    APP_LAYOUT_FIXED_WIDTH +
    minPanelWidth +
    countVisibleHandles(panels) * APP_LAYOUT_RESIZE_HANDLE_WIDTH
  );
}

/** Minimum window width if a given panel were expanded (for pre-expanding the window). */
export function computeMinWindowWidthWithPanel(panels: PanelMap, id: PanelId): number {
  const expanded = setPanelCollapsed(panels, id, false);
  return computeMinWindowWidth(expanded);
}

// ---------------------------------------------------------------------------
// Constrain — enforce min/max/available bounds (global policy)
// ---------------------------------------------------------------------------

/** Maximum width a panel can grow to, assuming siblings shrink to their min widths. */
export function computeMaxAvailableWidth(descriptor: PanelDescriptor, ctx: LayoutContext): number {
  const minTotal = computeMinWindowWidth(ctx.panels);
  return ctx.windowWidth - minTotal + descriptor.min;
}

/** Clamp width between panel min and the smaller of static max / available max. */
export function constrainWidth(
  descriptor: PanelDescriptor,
  width: number,
  ctx: LayoutContext,
): number {
  const maxAvailable = computeMaxAvailableWidth(descriptor, ctx);
  const max = Math.min(descriptor.max, maxAvailable);
  const min = Math.min(descriptor.min, maxAvailable);
  return Math.max(min, Math.min(width, max));
}

// ---------------------------------------------------------------------------
// Fit — resolve overflow across all panels (global solver)
// ---------------------------------------------------------------------------

/**
 * Compute shrink priority for a panel at runtime.
 * Higher priority = shrinks first.
 *
 * Dynamic priority: contentPanel gets highest priority when expanded.
 * This ensures window resize affects contentPanel first when it's open,
 * preserving chatPanel width when contentPanel is available to absorb changes.
 */
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

/** Shrink expanded panels by overflow priority until total width fits within windowWidth. */
export function shrinkPanelsToFit(
  panels: PanelMap,
  windowWidth: number,
  protectPanel?: PanelId,
): PanelMap {
  const excess = computeTotalWidth(panels) - windowWidth;
  if (excess <= 0) return panels;

  // Sort by DYNAMIC priority — higher priority shrinks first
  const byPriority = expandedDescriptors(panels).sort(
    (a, b) => getShrinkPriority(b, panels) - getShrinkPriority(a, panels),
  );

  let result = panels;
  let remaining = excess;

  for (const descriptor of byPriority) {
    if (remaining <= 0) break;
    // Skip protected panel (e.g., panel being opened)
    if (descriptor.id === protectPanel) continue;
    const give = descriptor.overflow.shrink(result[descriptor.id].width, descriptor.min, remaining);
    result = setPanelWidth(result, descriptor.id, result[descriptor.id].width - give);
    remaining -= give;
  }

  return result;
}

/**
 * Adjust panels when window width changes.
 * If contentPanel is expanded, it absorbs the change (grow or shrink).
 * If contentPanel is collapsed, chatPanel absorbs the change automatically (flex-1).
 *
 * This creates the UX where window resize primarily affects contentPanel when open,
 * preserving chatPanel width when possible.
 */
export function adjustPanelsForWindowDelta(
  panels: PanelMap,
  previousWidth: number,
  currentWidth: number,
): PanelMap {
  const delta = currentWidth - previousWidth;
  if (delta === 0) return panels;

  // If contentPanel is collapsed, chatPanel will naturally absorb the change (flex-1)
  // Just shrink panels if needed
  if (panels.contentPanel.collapsed) {
    if (delta < 0) {
      return shrinkPanelsToFit(panels, currentWidth);
    }
    return panels;
  }

  // contentPanel is expanded - let it absorb the window change
  const contentPanelDesc = getDescriptor("contentPanel");
  const contentPanel = panels.contentPanel;

  let result = panels;

  if (delta > 0) {
    // Window grew: expand contentPanel first
    const growRoom = contentPanelDesc.max - contentPanel.width;
    const grow = Math.min(delta, growRoom);
    if (grow > 0) {
      result = setPanelWidth(result, "contentPanel", contentPanel.width + grow);
    }
    // Any remaining delta is naturally absorbed by chatPanel (flex-1)
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

// ---------------------------------------------------------------------------
// Bulldozer — positional separator drag algorithm
// ---------------------------------------------------------------------------

/**
 * Find the nearest expanded panel on each side of a separator.
 * Returns the effective grow targets for a drag at this separator.
 */
function resolveEffectivePanels(
  panels: PanelMap,
  separatorIndex: number,
): { leftId: PanelId | null; rightId: PanelId | null } {
  let leftId: PanelId | null = null;
  for (let i = separatorIndex; i >= 0; i--) {
    if (!panels[PANEL_ORDER[i]].collapsed) {
      leftId = PANEL_ORDER[i];
      break;
    }
  }
  let rightId: PanelId | null = null;
  for (let i = separatorIndex + 1; i < PANEL_ORDER.length; i++) {
    if (!panels[PANEL_ORDER[i]].collapsed) {
      rightId = PANEL_ORDER[i];
      break;
    }
  }
  return { leftId, rightId };
}

/**
 * Apply a pixel delta from separator drag using bulldozer algorithm.
 * Separator `i` sits between PANEL_ORDER[i] and PANEL_ORDER[i+1].
 * Resolves effective expanded panels on each side (skipping collapsed gaps)
 * then walks panels by physical position from the separator outward.
 *
 * Special case: when contentPanel is expanded (1fr), dragging sep2 only adjusts chatPanel width.
 */
export function applyDelta(panels: PanelMap, separatorIndex: number, delta: number): PanelMap {
  if (delta === 0) return panels;

  // Special case: sep2 (chatPanel:contentPanel) when contentPanel is expanded (1fr)
  // Only adjust chatPanel width, contentPanel auto-adapts as 1fr
  if (separatorIndex === 1 && !panels.contentPanel.collapsed) {
    const chatPanel = panels.chatPanel;
    const chatPanelDesc = getDescriptor("chatPanel");
    const newWidth = Math.max(
      chatPanelDesc.min,
      Math.min(chatPanelDesc.max, chatPanel.width + delta),
    );
    if (newWidth !== chatPanel.width) {
      return setPanelWidthWithPreference(panels, "chatPanel", newWidth);
    }
    return panels;
  }

  const { leftId, rightId } = resolveEffectivePanels(panels, separatorIndex);
  const absDelta = Math.abs(delta);

  if (delta > 0) {
    // Drag right: grow left panel, shrink right panels
    if (!leftId) return panels;
    const growPanel = panels[leftId];

    const growDesc = getDescriptor(leftId);
    const growRoom = growDesc.max - growPanel.width;
    const cappedDelta = Math.min(absDelta, growRoom);
    if (cappedDelta <= 0) return panels;

    let result = panels;
    let remaining = cappedDelta;

    // Shrink from the effective right panel outward
    const rightStart = PANEL_ORDER.indexOf(leftId) + 1;
    for (let i = rightStart; i < PANEL_ORDER.length; i++) {
      if (remaining <= 0) break;
      const id = PANEL_ORDER[i];
      const panel = result[id];
      if (panel.collapsed) continue;
      const descriptor = getDescriptor(id);
      const give = descriptor.overflow.shrink(panel.width, descriptor.min, remaining);
      result = setPanelWidth(result, id, panel.width - give);
      remaining -= give;
    }
    const consumed = cappedDelta - remaining;
    if (consumed > 0) {
      // User dragged to grow this panel — update preferredWidth
      const newWidth = growPanel.width + consumed;
      result = setPanelWidthWithPreference(result, leftId, newWidth);
    }
    return result;
  } else {
    // Drag left: grow right panel, shrink left panels
    if (!rightId) return panels;
    const growPanel = panels[rightId];

    const growDesc = getDescriptor(rightId);
    const growRoom = growDesc.max - growPanel.width;
    const cappedDelta = Math.min(absDelta, growRoom);
    if (cappedDelta <= 0) return panels;

    let result = panels;
    let remaining = cappedDelta;

    // Shrink from the effective left panel outward
    const leftStart = PANEL_ORDER.indexOf(rightId) - 1;
    for (let i = leftStart; i >= 0; i--) {
      if (remaining <= 0) break;
      const id = PANEL_ORDER[i];
      const panel = result[id];
      if (panel.collapsed) continue;
      const descriptor = getDescriptor(id);
      const give = descriptor.overflow.shrink(panel.width, descriptor.min, remaining);
      result = setPanelWidth(result, id, panel.width - give);
      remaining -= give;
    }
    const consumed = cappedDelta - remaining;
    if (consumed > 0) {
      // User dragged to grow this panel — update preferredWidth
      const newWidth = growPanel.width + consumed;
      result = setPanelWidthWithPreference(result, rightId, newWidth);
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Panel operations — pipeline: propose → constrain → fit
// ---------------------------------------------------------------------------

/**
 * Expand a panel. Pipeline:
 * 1. Propose — open behavior computes target width (uses preferredWidth if available)
 * 2. Constrain — clamp within min/max/available bounds
 * 3. Fit — shrink siblings if layout overflows
 */
export function openPanel(panels: PanelMap, id: PanelId, windowWidth: number): PanelMap {
  const descriptor = getDescriptor(id);
  const panel = panels[id];

  // Use preferredWidth (user's last manual setting) if available, otherwise current width
  const storedWidth = panel.preferredWidth ?? panel.width;
  console.log("[openPanel]", {
    id,
    preferredWidth: panel.preferredWidth,
    storedWidth,
    windowWidth,
  });

  // 1. Propose
  const proposed = descriptor.open(storedWidth, { windowWidth, panels });
  console.log("[openPanel] proposed:", proposed);

  // 2. Constrain (against expanded state so available space accounts for this panel)
  const expanded = setPanelCollapsed(panels, id, false);
  const width = constrainWidth(descriptor, proposed, {
    windowWidth,
    panels: expanded,
  });
  console.log(
    "[openPanel] constrained:",
    width,
    "maxAvailable:",
    computeMaxAvailableWidth(descriptor, { windowWidth, panels: expanded }),
  );

  // 3. Fit - protect the panel being opened from shrinkage
  const fitted = shrinkPanelsToFit(setPanelWidth(expanded, id, width), windowWidth, id);
  console.log("[openPanel] fitted:", fitted[id].width);
  return fitted;
}

/** Collapse a panel (preserves stored width for restore). */
export function collapsePanel(panels: PanelMap, id: PanelId): PanelMap {
  return setPanelCollapsed(panels, id, true);
}
