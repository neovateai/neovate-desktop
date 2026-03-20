export type PanelId = "primarySidebar" | "chatPanel" | "contentPanel" | "secondarySidebar";

export type PanelState = {
  width: number;
  /** User's preferred width (preserved across window resizes). */
  preferredWidth?: number;
  collapsed: boolean;
  activeView?: string;
};

export type PanelMap = Record<PanelId, PanelState>;

export type SeparatorIndex = number;

export type SeparatorId =
  | "primarySidebar:chatPanel"
  | "chatPanel:contentPanel"
  | "contentPanel:secondarySidebar";

export type LayoutContext = {
  windowWidth: number;
  panels: PanelMap;
};

export type OpenBehavior = (storedWidth: number, ctx: LayoutContext) => number;

export type OverflowBehavior = {
  priority: number;
  shrink: (currentWidth: number, minWidth: number, excess: number) => number;
};

export type PanelDescriptor = {
  id: PanelId;
  min: number;
  max: number;
  defaultWidth: number;
  defaultCollapsed: boolean;
  open: OpenBehavior;
  overflow: OverflowBehavior;
};
