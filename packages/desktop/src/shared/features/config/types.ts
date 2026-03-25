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
  terminalFontSize: number;
  terminalFont: string;
  developerMode: boolean;

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

  // Keybindings
  keybindings: Record<string, string>;

  // Skills
  skillsRegistryUrls: string[];
};
