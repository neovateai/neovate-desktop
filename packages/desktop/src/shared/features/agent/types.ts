// ---------------------------------------------------------------------------
// Re-exports from sub-modules
// ---------------------------------------------------------------------------

import type { StopReason } from "./stream-event";
import type { CachedMessage, CachedAgentMessage } from "./agent-message";

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

// AgentMessage types
export type {
  TextPart,
  ThinkingPart,
  ToolInvocationPart,
  StatusPart,
  AgentMessagePart,
  AgentMessage,
  CachedMessage,
  CachedAgentMessage,
} from "./agent-message";

export { getParentToolUseId } from "./agent-message";

// ---------------------------------------------------------------------------
// Session Metadata
// ---------------------------------------------------------------------------

/** Agent metadata for subagent invocation */
export type AgentInfo = { id: string; name: string };

/** Slash command metadata */
export type SlashCommandInfo = { name: string; description?: string };

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
 *
 * Contains both legacy `messages` (for backward compat) and new `agentMessages`.
 */
export type CachedSession = {
  /**
   * @deprecated Use `agentMessages` instead.
   */
  messages: CachedMessage[];
  /** Parts-based cached messages. Present in caches written after the migration. */
  agentMessages?: CachedAgentMessage[];
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
