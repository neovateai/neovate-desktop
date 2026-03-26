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

/** Shrink expanded panels by overflow priority until total width fits within windowWidth. */
export function shrinkPanelsToFit(panels: PanelMap, windowWidth: number): PanelMap {
  const excess = computeTotalWidth(panels) - windowWidth;
  if (excess <= 0) return panels;

  const byPriority = expandedDescriptors(panels).sort((a, b) => {
    // When contentPanel is expanded, it should be shrunk before chatPanel
    // to protect chat width (contentPanel acts as a buffer)
    if (shouldContentPanelAbsorbChanges(panels)) {
      const aIsContentPanel = a.id === "contentPanel";
      const bIsContentPanel = b.id === "contentPanel";
      const aIsChatPanel = a.id === "chatPanel";
      const bIsChatPanel = b.id === "chatPanel";

      // If comparing contentPanel vs chatPanel, contentPanel shrinks first (sorts before chatPanel)
      if (aIsContentPanel && bIsChatPanel) return -1;
      if (bIsContentPanel && aIsChatPanel) return 1;
    }
    // Default: sort by overflow.priority (higher priority shrinks first)
    return b.overflow.priority - a.overflow.priority;
  });

  let result = panels;
  let remaining = excess;

  for (const descriptor of byPriority) {
    if (remaining <= 0) break;
    const give = descriptor.overflow.shrink(result[descriptor.id].width, descriptor.min, remaining);
    result = setPanelWidth(result, descriptor.id, result[descriptor.id].width - give);
    remaining -= give;
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
 * Check if contentPanel is expanded and should absorb width changes to protect chatPanel.
 * When contentPanel is expanded, it acts as a "buffer" between side panels and chatPanel.
 */
function shouldContentPanelAbsorbChanges(panels: PanelMap): boolean {
  return !panels.contentPanel.collapsed;
}

/**
 * Get shrink targets in priority order, with special handling for contentPanel elasticity.
 * When contentPanel is expanded, it should be shrunk before chatPanel to protect chat width.
 *
 * @param panels - Current panel state
 * @param shrinkLeftIds - Panel IDs to consider for shrinking, from left to right
 * @param shrinkRightIds - Panel IDs to consider for shrinking, from right to left
 */
function getShrinkTargets(
  panels: PanelMap,
  shrinkLeftIds: PanelId[],
  shrinkRightIds: PanelId[],
): { left: PanelId[]; right: PanelId[] } {
  const contentPanelAbsorbs = shouldContentPanelAbsorbChanges(panels);

  if (!contentPanelAbsorbs) {
    return { left: shrinkLeftIds, right: shrinkRightIds };
  }

  // When contentPanel should absorb changes, prioritize it over chatPanel
  // For left shrink targets (shrinking towards left)
  const leftHasContentPanel = shrinkLeftIds.includes("contentPanel");
  const leftHasChatPanel = shrinkLeftIds.includes("chatPanel");

  let leftTargets = shrinkLeftIds;
  if (leftHasContentPanel && leftHasChatPanel) {
    // Move contentPanel to the front so it gets shrunk first
    const filtered = shrinkLeftIds.filter((id) => id !== "contentPanel");
    leftTargets = ["contentPanel", ...filtered];
  }

  // For right shrink targets (shrinking towards right)
  const rightHasContentPanel = shrinkRightIds.includes("contentPanel");
  const rightHasChatPanel = shrinkRightIds.includes("chatPanel");

  let rightTargets = shrinkRightIds;
  if (rightHasContentPanel && rightHasChatPanel) {
    // Move contentPanel to the front so it gets shrunk first
    const filtered = shrinkRightIds.filter((id) => id !== "contentPanel");
    rightTargets = ["contentPanel", ...filtered];
  }

  return { left: leftTargets, right: rightTargets };
}

/**
 * Apply a pixel delta from separator drag using bulldozer algorithm.
 * Separator `i` sits between PANEL_ORDER[i] and PANEL_ORDER[i+1].
 * Resolves effective expanded panels on each side (skipping collapsed gaps)
 * then walks panels by physical position from the separator outward.
 *
 * When contentPanel is expanded, it acts as a buffer to protect chatPanel width:
 * - Dragging primarySidebar:chatPanel separator shrinks contentPanel first
 * - Dragging chatPanel:contentPanel separator shrinks contentPanel first
 * - Dragging contentPanel:secondarySidebar separator shrinks contentPanel first
 */
export function applyDelta(panels: PanelMap, separatorIndex: number, delta: number): PanelMap {
  if (delta === 0) return panels;

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

    // Build shrink targets: panels to the right of leftId, in physical order
    const leftIndex = PANEL_ORDER.indexOf(leftId);
    const shrinkRightIds: PanelId[] = [];
    for (let i = PANEL_ORDER.length - 1; i > leftIndex; i--) {
      const id = PANEL_ORDER[i];
      if (!result[id].collapsed) {
        shrinkRightIds.push(id);
      }
    }

    // Build shrink targets: panels to the left (for symmetry, though not used in this branch)
    const shrinkLeftIds: PanelId[] = [];
    for (let i = leftIndex; i >= 0; i--) {
      const id = PANEL_ORDER[i];
      if (!result[id].collapsed) {
        shrinkLeftIds.push(id);
      }
    }

    const { right: shrinkTargets } = getShrinkTargets(result, shrinkLeftIds, shrinkRightIds);

    for (const id of shrinkTargets) {
      if (remaining <= 0) break;
      const panel = result[id];
      if (panel.collapsed) continue;
      const descriptor = getDescriptor(id);
      const give = descriptor.overflow.shrink(panel.width, descriptor.min, remaining);
      result = setPanelWidth(result, id, panel.width - give);
      remaining -= give;
    }

    const consumed = cappedDelta - remaining;
    if (consumed > 0) {
      result = setPanelWidth(result, leftId, growPanel.width + consumed);
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

    // Build shrink targets: panels to the left of rightId, in physical order
    const rightIndex = PANEL_ORDER.indexOf(rightId);
    const shrinkLeftIds: PanelId[] = [];
    for (let i = rightIndex - 1; i >= 0; i--) {
      const id = PANEL_ORDER[i];
      if (!result[id].collapsed) {
        shrinkLeftIds.push(id);
      }
    }

    // Build shrink targets: panels to the right (for symmetry, though not used in this branch)
    const shrinkRightIds: PanelId[] = [];
    for (let i = rightIndex; i < PANEL_ORDER.length; i++) {
      const id = PANEL_ORDER[i];
      if (!result[id].collapsed) {
        shrinkRightIds.push(id);
      }
    }

    const { left: shrinkTargets } = getShrinkTargets(result, shrinkLeftIds, shrinkRightIds);

    for (const id of shrinkTargets) {
      if (remaining <= 0) break;
      const panel = result[id];
      if (panel.collapsed) continue;
      const descriptor = getDescriptor(id);
      const give = descriptor.overflow.shrink(panel.width, descriptor.min, remaining);
      result = setPanelWidth(result, id, panel.width - give);
      remaining -= give;
    }

    const consumed = cappedDelta - remaining;
    if (consumed > 0) {
      result = setPanelWidth(result, rightId, growPanel.width + consumed);
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Panel operations — pipeline: propose → constrain → fit
// ---------------------------------------------------------------------------

/**
 * Expand a panel. Pipeline:
 * 1. Propose — open behavior computes target width
 * 2. Constrain — clamp within min/max/available bounds
 * 3. Absorb — when contentPanel is expanded, absorb width from it to protect chatPanel
 * 4. Fit — shrink siblings if layout overflows
 *
 * When contentPanel is expanded, it acts as a buffer:
 * - Opening primarySidebar or secondarySidebar absorbs width from contentPanel
 * - This keeps chatPanel width stable
 */
export function openPanel(panels: PanelMap, id: PanelId, windowWidth: number): PanelMap {
  const descriptor = getDescriptor(id);
  const contentPanelAbsorbs = shouldContentPanelAbsorbChanges(panels);

  // 1. Propose
  const proposed = descriptor.open(panels[id].width, { windowWidth, panels });

  // 2. Constrain (against expanded state so available space accounts for this panel)
  const expanded = setPanelCollapsed(panels, id, false);
  const width = constrainWidth(descriptor, proposed, {
    windowWidth,
    panels: expanded,
  });

  // 3. Apply width change
  let result = setPanelWidth(expanded, id, width);

  // When contentPanel is expanded and we're opening a side panel,
  // absorb the width change from contentPanel to protect chatPanel
  if (contentPanelAbsorbs && id !== "contentPanel" && id !== "chatPanel") {
    // Calculate how much width this panel is gaining
    const widthGain = width - (panels[id].collapsed ? 0 : panels[id].width);

    if (widthGain > 0) {
      // Take from contentPanel, but respect its minimum
      const contentMin = getDescriptor("contentPanel").min;
      const canTake = result.contentPanel.width - contentMin;
      const takeAmount = Math.min(widthGain, canTake);
      if (takeAmount > 0) {
        result = setPanelWidth(result, "contentPanel", result.contentPanel.width - takeAmount);
      }
    }
  }

  // 4. Fit if overflow
  return shrinkPanelsToFit(result, windowWidth);
}

/**
 * Collapse a panel (preserves stored width for restore).
 * When contentPanel is expanded and a side panel collapses,
 * give the freed space back to contentPanel.
 */
export function collapsePanel(panels: PanelMap, id: PanelId): PanelMap {
  const contentPanelAbsorbs = shouldContentPanelAbsorbChanges(panels);

  if (contentPanelAbsorbs && id !== "contentPanel" && id !== "chatPanel") {
    // The panel is collapsing, so it frees up its width
    const freedWidth = panels[id].width;

    // Give the freed space back to contentPanel
    if (freedWidth > 0) {
      let result = setPanelCollapsed(panels, id, true);
      result = setPanelWidth(result, "contentPanel", panels.contentPanel.width + freedWidth);
      return result;
    }
  }

  return setPanelCollapsed(panels, id, true);
}
