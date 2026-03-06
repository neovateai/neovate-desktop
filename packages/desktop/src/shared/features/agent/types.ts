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
