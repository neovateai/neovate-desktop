import type { PanelDescriptor, PanelId, PanelMap, LayoutContext } from "./types";
import { APP_LAYOUT_FIXED_WIDTH, APP_LAYOUT_RESIZE_HANDLE_WIDTH, PANEL_ORDER } from "./constants";
import { getDescriptor, PANEL_DESCRIPTORS } from "./panel-descriptors";

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

/** Count visible resize handles (one between each pair of adjacent expanded panels). */
function countVisibleHandles(panels: PanelMap): number {
  let count = 0;
  let prevExpanded = false;
  for (const id of PANEL_ORDER) {
    const expanded = !panels[id].collapsed;
    if (expanded && prevExpanded) count++;
    prevExpanded = expanded;
  }
  return count;
}

/** Total width consumed by fixed chrome, all expanded panels, and visible handles. */
export function computeTotalWidth(panels: PanelMap): number {
  const panelWidth = expandedDescriptors(panels).reduce(
    (total, descriptor) => total + panels[descriptor.id].width,
    0,
  );
  return APP_LAYOUT_FIXED_WIDTH + panelWidth + countVisibleHandles(panels) * APP_LAYOUT_RESIZE_HANDLE_WIDTH;
}

/** Minimum window width so every expanded panel can sit at its min width. */
export function computeMinWindowWidth(panels: PanelMap): number {
  const minPanelWidth = expandedDescriptors(panels).reduce(
    (total, descriptor) => total + descriptor.min,
    0,
  );
  return APP_LAYOUT_FIXED_WIDTH + minPanelWidth + countVisibleHandles(panels) * APP_LAYOUT_RESIZE_HANDLE_WIDTH;
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
 * Apply a pixel delta from separator drag using bulldozer algorithm.
 * Separator `i` sits between PANEL_ORDER[i] and PANEL_ORDER[i+1].
 * Walks panels by physical position from the separator outward.
 */
export function applyDelta(panels: PanelMap, separatorIndex: number, delta: number): PanelMap {
  if (delta === 0) return panels;

  const absDelta = Math.abs(delta);

  if (delta > 0) {
    // Drag right: shrink panels to the RIGHT, grow panel to the LEFT
    const growId = PANEL_ORDER[separatorIndex];
    const growPanel = panels[growId];
    if (growPanel.collapsed) return panels;

    // Cap delta by how much the grow side can absorb
    const growDesc = getDescriptor(growId);
    const growRoom = growDesc.max - growPanel.width;
    const cappedDelta = Math.min(absDelta, growRoom);
    if (cappedDelta <= 0) return panels;

    let result = panels;
    let remaining = cappedDelta;

    for (let i = separatorIndex + 1; i < PANEL_ORDER.length; i++) {
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
      result = setPanelWidth(result, growId, growPanel.width + consumed);
    }
    return result;
  } else {
    // Drag left: shrink panels to the LEFT, grow panel to the RIGHT
    const growId = PANEL_ORDER[separatorIndex + 1];
    const growPanel = panels[growId];
    if (growPanel.collapsed) return panels;

    // Cap delta by how much the grow side can absorb
    const growDesc = getDescriptor(growId);
    const growRoom = growDesc.max - growPanel.width;
    const cappedDelta = Math.min(absDelta, growRoom);
    if (cappedDelta <= 0) return panels;

    let result = panels;
    let remaining = cappedDelta;

    for (let i = separatorIndex; i >= 0; i--) {
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
      result = setPanelWidth(result, growId, growPanel.width + consumed);
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
  const width = constrainWidth(descriptor, proposed, { windowWidth, panels: expanded });

  // 3. Fit
  return shrinkPanelsToFit(setPanelWidth(expanded, id, width), windowWidth);
}

/** Collapse a panel (preserves stored width for restore). */
export function collapsePanel(panels: PanelMap, id: PanelId): PanelMap {
  return setPanelCollapsed(panels, id, true);
}
