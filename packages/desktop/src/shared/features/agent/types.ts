// ---------------------------------------------------------------------------
// Re-exports from sub-modules
// ---------------------------------------------------------------------------

import type { UIMessage, StopReason } from "./ui-message";

// UIMessage types
export type { DynamicToolPart, UIMessagePart, UIMessage } from "./ui-message";

// Base types (re-exported from ui-message.ts)
export type {
  StopReason,
  TaskStatus,
  RateLimitStatus,
  RateLimitType,
  RateLimitInfo,
  PersistedFile,
  FailedFile,
} from "./ui-message";

export { getParentToolUseId } from "./ui-message";

// ---------------------------------------------------------------------------
// Session Metadata
// ---------------------------------------------------------------------------

/** Agent metadata for subagent invocation */
export type AgentInfo = { id: string; name: string };

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

export type SlashCommandInfo = {
  name: string;
  description?: string;
  argumentHint?: string;
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
