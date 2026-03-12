export const WORKBENCH_PART = {
  primarySidebar: "primarySidebar",
  chatPanel: "chatPanel",
  contentPanel: "contentPanel",
  secondarySidebar: "secondarySidebar",
} as const;

export type WorkbenchPartId = (typeof WORKBENCH_PART)[keyof typeof WORKBENCH_PART];

export const COLLAPSIBLE_WORKBENCH_PART = {
  primarySidebar: WORKBENCH_PART.primarySidebar,
  contentPanel: WORKBENCH_PART.contentPanel,
  secondarySidebar: WORKBENCH_PART.secondarySidebar,
} as const;

export type CollapsibleWorkbenchPartId =
  (typeof COLLAPSIBLE_WORKBENCH_PART)[keyof typeof COLLAPSIBLE_WORKBENCH_PART];

export interface IWorkbenchLayoutService {
  expandPart(part: CollapsibleWorkbenchPartId): void | Promise<void>;
  togglePart(part: CollapsibleWorkbenchPartId): void | Promise<void>;
}
