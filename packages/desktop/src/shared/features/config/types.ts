export type Theme = "system" | "light" | "dark";
export type ThemeStyle = "default" | "claude" | "codex" | "nord";
export type SendMessageWith = "enter" | "cmdEnter";
export type Locales = "en-US" | "zh-CN";
export type ConfigPermissionMode = "default" | "acceptEdits" | "bypassPermissions";
export type NotificationSound = "off" | "default" | "Glass" | "Ping" | "Pop" | "Funk";
export type AgentLanguage = "English" | "Chinese";
export type SidebarOrganize = "byProject" | "chronological";
export type SidebarSortBy = "created" | "updated";

export type AppConfig = {
  // General Settings
  theme: Theme;
  themeStyle: ThemeStyle;
  locale: Locales;
  runOnStartup: boolean;
  multiProjectSupport: boolean;
  appFontSize: number;
  terminalFontSize: number;
  terminalFont: string;
  developerMode: boolean;
  showSessionInitStatus: boolean;
  claudeCodeBinPath: string;

  // Sidebar Settings (multi-project mode)
  sidebarOrganize: SidebarOrganize;
  sidebarSortBy: SidebarSortBy;

  // Chat Settings
  sendMessageWith: SendMessageWith;
  agentLanguage: AgentLanguage;
  permissionMode: ConfigPermissionMode;
  notificationSound: NotificationSound;
  tokenOptimization: boolean;
  networkInspector: boolean;
  keepAwake: boolean;
  preWarmSessions: boolean;
  /** Encoded "providerId:modelId" for auxiliary LLM calls (plugins, background tasks). Empty = not configured. */
  auxiliaryModelSelection: string;

  // Keybindings
  keybindings: Record<string, string>;

  // Popup Window
  popupWindowEnabled: boolean;
  popupWindowShortcut: string;
  popupWindowStayOpen: boolean;

  // Skills
  skillsRegistries: SkillsRegistry[];
  npmRegistry: string;
};

export type SkillsRegistry = {
  url: string;
};
