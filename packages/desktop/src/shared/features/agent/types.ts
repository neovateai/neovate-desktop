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

export type FastModeState = "off" | "cooldown" | "on";

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";

export type RewindFilesResult = {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
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

export type TimingEntry = {
  phase: string;
  label: string;
  durationMs: number;
  timestamp: number;
};

export type SlashCommandInfo = { name: string; description?: string; argumentHint?: string };

/** What the eventIterator yields to the renderer */
export type StreamEvent =
  | { type: "text_delta"; sessionId: string; text: string }
  | { type: "thinking_delta"; sessionId: string; text: string }
  | {
      type: "tool_use";
      sessionId: string;
      toolId: string;
      name: string;
      status: string;
      input?: unknown;
    }
  | {
      type: "user_message";
      sessionId: string;
      text: string;
      images?: Array<{ mediaType: string; base64: string }>;
    }
  | {
      type: "result";
      sessionId: string;
      stopReason: string;
      costUsd?: number;
      durationMs?: number;
      inputTokens?: number;
      outputTokens?: number;
    }
  | { type: "permission_request"; requestId: string; toolName: string; input: unknown }
  | { type: "available_commands"; sessionId: string; commands: SlashCommandInfo[] }
  | { type: "available_models"; sessionId: string; models: ModelInfo[] }
  | { type: "current_model"; sessionId: string; model: string }
  | { type: "timing"; entry: TimingEntry }
  | { type: "status"; sessionId: string; message: string }
  | {
      type: "task_started";
      sessionId: string;
      taskId: string;
      description: string;
      taskType?: string;
    }
  | {
      type: "task_progress";
      sessionId: string;
      taskId: string;
      description: string;
      toolUses: number;
      durationMs: number;
      lastToolName?: string;
    }
  | {
      type: "task_notification";
      sessionId: string;
      taskId: string;
      status: "completed" | "failed" | "stopped";
      summary: string;
    };

/** Lightweight session metadata for the sidebar list */
export type SessionInfo = {
  sessionId: string;
  title?: string;
  cwd?: string;
  updatedAt: string;
  createdAt: string;
};

/** Final return value when loadSession replay completes */
export type LoadSessionResult = {
  sessionId: string;
};

/** Final return value when prompt completes */
export type PromptResult = {
  stopReason: string;
};
