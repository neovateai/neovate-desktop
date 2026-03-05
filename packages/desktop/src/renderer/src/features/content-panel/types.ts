export type Tab = {
  id: string; // stable crypto.randomUUID()
  viewType: string; // references ContentPanelView.viewType
  name: string; // displayed in tab bar
  state: Record<string, unknown>; // plugin-managed restorable state, persisted with tab
};

export type ProjectTabState = {
  tabs: Tab[];
  activeTabId: string | null;
};

export interface ContentPanelStoreState {
  projects: Record<string, ProjectTabState>;
  addTab(projectPath: string, tab: Tab, activate?: boolean): void;
  removeTab(projectPath: string, tabId: string): void;
  setActiveTab(projectPath: string, tabId: string | null): void;
  updateTab(projectPath: string, tabId: string, patch: { name?: string }): void;
  updateTabState(projectPath: string, tabId: string, patch: Record<string, unknown>): void;
  getTab(projectPath: string, tabId: string): Tab | undefined;
  getProjectState(projectPath: string): ProjectTabState;
  findTabByViewType(projectPath: string, viewType: string): Tab | undefined;
  removeProject(projectPath: string): void;
}
