import type { PanelDescriptor, PanelId } from "./types";

import { open, overflow } from "./behaviors";
import { APP_LAYOUT_CHAT_PANEL_MIN_WIDTH } from "./constants";

export const PANEL_DESCRIPTORS: PanelDescriptor[] = [
  {
    id: "primarySidebar",
    min: 250,
    max: 600,
    defaultWidth: 300,
    defaultCollapsed: false,
    open: open.restore(),
    overflow: overflow.shrinkable(0),
  },
  {
    id: "chatPanel",
    min: APP_LAYOUT_CHAT_PANEL_MIN_WIDTH,
    max: Infinity,
    defaultWidth: 0, // calculated on init
    defaultCollapsed: false,
    open: open.restore(),
    overflow: overflow.shrinkable(3), // highest priority — shrinks first on window resize
  },
  {
    id: "contentPanel",
    min: 300,
    max: Infinity,
    defaultWidth: 300,
    defaultCollapsed: true,
    open: open.splitWith(300, 0.5),
    overflow: overflow.shrinkable(2),
  },
  {
    id: "secondarySidebar",
    min: 240,
    max: 600,
    defaultWidth: 240,
    defaultCollapsed: true,
    open: open.restore(),
    overflow: overflow.shrinkable(1),
  },
];

export function getDescriptor(panelId: PanelId): PanelDescriptor {
  const desc = PANEL_DESCRIPTORS.find((d) => d.id === panelId);
  if (!desc) throw new Error(`Unknown panel: ${panelId}`);
  return desc;
}
