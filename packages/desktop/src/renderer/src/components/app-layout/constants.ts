import type { PanelId, SeparatorId } from "./types";

/** Minimum width of the chat panel */
export const APP_LAYOUT_CHAT_PANEL_MIN_WIDTH = 460;
/** Width of the activity bar on the right edge */
export const APP_LAYOUT_ACTIVITY_BAR_WIDTH = 40;
/** Spacing between the window edge and the primary sidebar */
export const APP_LAYOUT_EDGE_SPACING = 8;
/** Width of the draggable resize handles between panels */
export const APP_LAYOUT_RESIZE_HANDLE_WIDTH = 5;
/** Sum of non-resizable widths: activity bar + edge spacing */
export const APP_LAYOUT_FIXED_WIDTH = APP_LAYOUT_ACTIVITY_BAR_WIDTH + APP_LAYOUT_EDGE_SPACING;
/** Left margin for the titlebar when the primary sidebar is collapsed (traffic lights + toggle) */
export const APP_LAYOUT_COLLAPSED_TITLEBAR_LEFT_MARGIN = 136;

/** Physical left-to-right order of all resizable panels. */
export const PANEL_ORDER: PanelId[] = [
  "primarySidebar",
  "chatPanel",
  "contentPanel",
  "secondarySidebar",
];

/** Semantic separator IDs derived from adjacent panel pairs. */
export const SEPARATOR_IDS = PANEL_ORDER.slice(0, -1).map(
  (left, i) => `${left}:${PANEL_ORDER[i + 1]}` as SeparatorId,
);

/** Convert a semantic separator ID to its numeric index. */
export function separatorIdToIndex(id: SeparatorId): number {
  const idx = SEPARATOR_IDS.indexOf(id);
  if (idx === -1) throw new Error(`Unknown separator ID: ${id}`);
  return idx;
}

/** Convert a numeric separator index to its semantic ID. */
export function separatorIndexToId(index: number): SeparatorId {
  const id = SEPARATOR_IDS[index];
  if (!id) throw new Error(`Unknown separator index: ${index}`);
  return id;
}

/** Grid area names for each layout element, keyed by PanelId, SeparatorId, or fixed element name. */
export const APP_LAYOUT_GRID_AREA: Record<
  PanelId | SeparatorId | "titleBar" | "activityBar",
  string
> = {
  primarySidebar: "primarySidebar",
  chatPanel: "chatPanel",
  contentPanel: "contentPanel",
  secondarySidebar: "secondarySidebar",
  titleBar: "titleBar",
  activityBar: "activityBar",
  "primarySidebar:chatPanel": "primarySidebar_chatPanel",
  "chatPanel:contentPanel": "chatPanel_contentPanel",
  "contentPanel:secondarySidebar": "contentPanel_secondarySidebar",
};

/** CSS Grid template for the root layout. */
export const APP_LAYOUT_GRID = {
  gridTemplateAreas: `
    "${APP_LAYOUT_GRID_AREA.primarySidebar} ${APP_LAYOUT_GRID_AREA["primarySidebar:chatPanel"]} ${APP_LAYOUT_GRID_AREA.titleBar}   ${APP_LAYOUT_GRID_AREA.titleBar}                       ${APP_LAYOUT_GRID_AREA.titleBar}      ${APP_LAYOUT_GRID_AREA.titleBar}                              ${APP_LAYOUT_GRID_AREA.titleBar}          ${APP_LAYOUT_GRID_AREA.titleBar}"
    "${APP_LAYOUT_GRID_AREA.primarySidebar} ${APP_LAYOUT_GRID_AREA["primarySidebar:chatPanel"]} ${APP_LAYOUT_GRID_AREA.chatPanel}  ${APP_LAYOUT_GRID_AREA["chatPanel:contentPanel"]} ${APP_LAYOUT_GRID_AREA.contentPanel}  ${APP_LAYOUT_GRID_AREA["contentPanel:secondarySidebar"]} ${APP_LAYOUT_GRID_AREA.secondarySidebar}  ${APP_LAYOUT_GRID_AREA.activityBar}"
  `,
  gridTemplateColumns: "auto auto 1fr auto auto auto auto auto",
  gridTemplateRows: "auto 1fr",
} as const;
