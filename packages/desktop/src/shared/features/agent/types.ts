// ---------------------------------------------------------------------------
// Re-exports from sub-modules
// ---------------------------------------------------------------------------

import type { StopReason, StreamEvent } from "./stream-event";
import type { UIMessagePartExtended, UIMessage } from "./ui-message";

export type SessionUIMessage = UIMessagePartExtended | StreamEvent;

// StreamEvent types
export type {
  StopReason,
  TaskStatus,
  RateLimitStatus,
  RateLimitType,
  ImageAttachment,
  TimingEntry,
  RateLimitInfo,
  PersistedFile,
  FailedFile,
  StreamEvents,
  StreamEvent,
} from "./stream-event";

// UIMessage types
export type { ToolInvocationPart, UIMessagePartExtended, UIMessage } from "./ui-message";

export { getParentToolUseId } from "./ui-message";

// ---------------------------------------------------------------------------
// Session Metadata
// ---------------------------------------------------------------------------

/** Agent metadata for subagent invocation */
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

/** Slash command metadata */
export type SlashCommandInfo = { name: string; description?: string; argumentHint?: string };

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
  stopReason: StopReason;
};

// ---------------------------------------------------------------------------
// Session Cache Types
// ---------------------------------------------------------------------------

/**
 * Persisted session cache for instant resume.
 */
export type CachedSession = {
  /** Parts-based cached messages */
  messages: UIMessage[];
  title?: string;
  cwd?: string;
  updatedAt: string;
  usage?: {
    totalCostUsd: number;
    totalDurationMs: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  };
};
