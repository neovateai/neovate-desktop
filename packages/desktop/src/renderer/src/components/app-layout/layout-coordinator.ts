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

  const byPriority = expandedDescriptors(panels).sort(
    (a, b) => b.overflow.priority - a.overflow.priority,
  );

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
 * Apply a pixel delta from separator drag using bulldozer algorithm.
 * Separator `i` sits between PANEL_ORDER[i] and PANEL_ORDER[i+1].
 * Resolves effective expanded panels on each side (skipping collapsed gaps)
 * then walks panels by physical position from the separator outward.
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
 * 3. Fit — shrink siblings if layout overflows
 */
export function openPanel(panels: PanelMap, id: PanelId, windowWidth: number): PanelMap {
  const descriptor = getDescriptor(id);

  // 1. Propose
  const proposed = descriptor.open(panels[id].width, { windowWidth, panels });

  // 2. Constrain (against expanded state so available space accounts for this panel)
  const expanded = setPanelCollapsed(panels, id, false);
  const width = constrainWidth(descriptor, proposed, {
    windowWidth,
    panels: expanded,
  });

  // 3. Fit
  return shrinkPanelsToFit(setPanelWidth(expanded, id, width), windowWidth);
}

/** Collapse a panel (preserves stored width for restore). */
export function collapsePanel(panels: PanelMap, id: PanelId): PanelMap {
  return setPanelCollapsed(panels, id, true);
}
