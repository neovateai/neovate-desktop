export type AgentInfo = { name: string; description: string; model?: string };

export type ModelInfo = {
  value: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: ("low" | "medium" | "high" | "max")[];
};

export type AccountInfo = {
  email?: string;
  organization?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
};

export type ModelScope = "session" | "project" | "global";

export type FastModeState = "off" | "cooldown" | "on";

export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "dontAsk"
  | "auto";

export type RewindFilesResult = {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
};

export type RewindResult = {
  forkedSessionId: string;
  originalSessionId: string;
};

export type McpStdioServerConfig = {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type McpSSEServerConfig = {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
};

export type McpHttpServerConfig = {
  type: "http";
  url: string;
  headers?: Record<string, string>;
};

export type McpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig;

export type McpServerStatus = {
  name: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled";
  serverInfo?: { name: string; version: string };
  error?: string;
  scope?: string;
  tools?: Array<{
    name: string;
    description?: string;
    annotations?: { readOnly?: boolean; destructive?: boolean; openWorld?: boolean };
  }>;
};

export type McpSetServersResult = {
  added: string[];
  removed: string[];
  errors: Record<string, string>;
};

/** Image attachment sent alongside a prompt */
export type ImageAttachment = {
  id: string;
  filename: string;
  mediaType: string;
  base64: string;
};

export type SlashCommandInfo = { name: string; description?: string; argumentHint?: string };

/** Lightweight session metadata for the sidebar list */
export type SessionInfo = {
  sessionId: string;
  title?: string;
  cwd?: string;
  updatedAt: string;
  createdAt: string;
};

/** Active in-memory session from SessionManager */
export type ActiveSessionInfo = {
  sessionId: string;
  cwd: string;
  createdAt: number;
  model?: string;
  providerId?: string;
};
