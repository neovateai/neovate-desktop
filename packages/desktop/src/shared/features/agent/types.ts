import type { ClaudeCodeToolName } from "./tools";

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

export type SlashCommandInfo = { name: string; description?: string };

// ---------------------------------------------------------------------------
// Stream Events (main → renderer via oRPC eventIterator)
// ---------------------------------------------------------------------------

/** What the eventIterator yields to the renderer */
export type StreamEvent =
  | { type: "text_delta"; sessionId: string; text: string }
  | { type: "thinking_delta"; sessionId: string; text: string }
  /**
   * @deprecated Use `tool_input_available` / `tool_output_available` / `tool_output_error` instead.
   * Kept for backward compatibility during migration.
   */
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
    }
  // ── New structured tool events ──
  | {
      type: "tool_input_available";
      sessionId: string;
      toolCallId: string;
      toolName: string;
      input: unknown;
      parentToolUseId?: string;
    }
  | { type: "tool_output_available"; sessionId: string; toolCallId: string; output: string }
  | { type: "tool_output_error"; sessionId: string; toolCallId: string; errorText: string };

// ---------------------------------------------------------------------------
// Agent Message Parts (parts-based message model)
// ---------------------------------------------------------------------------

/** A plain text content part. */
export type TextPart = { type: "text"; text: string };

/** An extended-thinking / reasoning content part. */
export type ThinkingPart = { type: "thinking"; thinking: string };

/**
 * A tool invocation part that tracks a single tool call lifecycle.
 *
 * `toolName` matches a key in `claudeCodeTools` (e.g. `"Bash"`, `"Read"`).
 */
export type ToolInvocationPart = {
  type: "tool-invocation";
  toolCallId: string;
  toolName: ClaudeCodeToolName;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input: unknown;
  output?: string;
  errorText?: string;
  /** Set when this tool is a child of a Task tool. */
  parentToolUseId?: string;
};

/** A lightweight status message part. */
export type StatusPart = { type: "status"; message: string };

/** Discriminated union of all agent message part types. */
export type AgentMessagePart = TextPart | ThinkingPart | ToolInvocationPart | StatusPart;

/**
 * A parts-based agent message. Each message contains an ordered array of
 * typed parts that can be individually rendered by the UI.
 */
export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  parts: AgentMessagePart[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type-safe accessor for the parent tool use ID on a ToolInvocationPart. */
export function getParentToolUseId(part: ToolInvocationPart): string | undefined {
  return part.parentToolUseId;
}

// ---------------------------------------------------------------------------
// Session metadata
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Session cache
// ---------------------------------------------------------------------------

/**
 * @deprecated Use {@link CachedAgentMessage} instead.
 * Cached message for persisted session display.
 */
export type CachedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  toolCalls?: Array<{ toolCallId: string; name: string; status?: string; input?: unknown }>;
  images?: Array<{ mediaType: string; base64: string }>;
};

/** Cached parts-based agent message for persisted session display. */
export type CachedAgentMessage = {
  id: string;
  role: "user" | "assistant";
  parts: AgentMessagePart[];
};

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
