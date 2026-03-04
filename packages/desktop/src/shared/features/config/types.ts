export type Theme = "system" | "light" | "dark";
export type SendMessageWith = "enter" | "cmdEnter";
export type Locales = "en-US" | "zh-CN";
export type ApprovalMode = "default" | "autoEdit" | "yolo";
export type NotificationSound = "off" | "default" | "Glass" | "Ping" | "Pop" | "Funk";
export type AgentLanguage = "English" | "Chinese";

export type AppConfig = {
  // General Settings
  theme: Theme;
  locale: Locales;
  runOnStartup: boolean;
  multiProjectSupport: boolean;
  terminalFontSize: number;
  terminalFont: string;
  developerMode: boolean;

  // Chat Settings
  sendMessageWith: SendMessageWith;
  agentLanguage: AgentLanguage;
  approvalMode: ApprovalMode;
  notificationSound: NotificationSound;

  // Keybindings
  keybindings: Record<string, string>;
};
