import type { SlashCommandInfo, ModelInfo } from "./types";

// ---------------------------------------------------------------------------
// Base Types for Stream Events
// ---------------------------------------------------------------------------

/** SDK result stop reasons - derived from SDK result subtype */
export type StopReason =
  | "end_turn"
  | "error"
  | "error_during_execution"
  | "error_max_turns"
  | "error_max_budget_usd"
  | "error_max_structured_output_retries"
  | "tool_use"
  | "stop_sequence"
  | string; // Fallback for unknown reasons

/** Task completion status for subagent operations */
export type TaskStatus = "completed" | "failed" | "stopped";

/** Rate limit status values */
export type RateLimitStatus = "allowed" | "allowed_warning" | "rejected";

/** Rate limit type categories */
export type RateLimitType =
  | "five_hour"
  | "seven_day"
  | "seven_day_opus"
  | "seven_day_sonnet"
  | "overage";

// ---------------------------------------------------------------------------
// Auxiliary Types for Stream Events
// ---------------------------------------------------------------------------

/** Image attachment sent alongside a prompt */
export type ImageAttachment = {
  id: string;
  filename: string;
  mediaType: string;
  base64: string;
};

/** Timing measurement for performance tracking */
export type TimingEntry = {
  phase: string;
  label: string;
  durationMs: number;
  timestamp: number;
};

/** Rate limit information structure */
export type RateLimitInfo = {
  status: RateLimitStatus;
  resetsAt?: number;
  rateLimitType?: RateLimitType;
  utilization?: number;
};

/** Successfully persisted file record */
export type PersistedFile = {
  filename: string;
  fileId: string;
};

/** Failed file persistence record */
export type FailedFile = {
  filename: string;
  error: string;
};

// ---------------------------------------------------------------------------
// Stream Events Namespace
// ---------------------------------------------------------------------------

/**
 * Individual stream event types organized by category.
 *
 * Use these types when you need precise typing for specific event handling.
 * For general event handling, use the `StreamEvent` union type.
 */
export namespace StreamEvents {
  // ── Content events ──

  /** Streaming text delta from assistant */
  export type TextDelta = { type: "text_delta"; sessionId: string; text: string };

  /** Streaming thinking/reasoning delta from assistant */
  export type ThinkingDelta = { type: "thinking_delta"; sessionId: string; text: string };

  /** User message submitted to the session */
  export type UserMessage = {
    type: "user_message";
    sessionId: string;
    text: string;
    images?: { mediaType: string; base64: string }[];
  };

  // ── Tool events ──

  /**
   * Tool invocation event when the assistant calls a tool. This is emitted at the start of the tool call, before input is available.
   */
  export type ToolUse = {
    type: "tool_use";
    sessionId: string;
    toolId: string;
    name: string;
    status: string;
    input?: unknown;
  };

  /** Tool invocation started with input available */
  export type ToolInputAvailable = {
    type: "tool_input_available";
    sessionId: string;
    toolCallId: string;
    toolName: string;
    input: unknown;
    /** Set when this tool is a child of a Task tool */
    parentToolUseId?: string;
  };

  /** Tool completed successfully with output */
  export type ToolOutputAvailable = {
    type: "tool_output_available";
    sessionId: string;
    toolCallId: string;
    output: string;
  };

  /** Tool execution failed with error */
  export type ToolOutputError = {
    type: "tool_output_error";
    sessionId: string;
    toolCallId: string;
    errorText: string;
  };

  // ── Session lifecycle events ──

  /** Session completed with result */
  export type Result = {
    type: "result";
    sessionId: string;
    stopReason: StopReason;
    costUsd?: number;
    durationMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    isError?: boolean;
    errors?: string[];
  };

  /** Permission request pending user approval */
  export type PermissionRequest = {
    type: "permission_request";
    sessionId: string;
    requestId: string;
    toolName: string;
    input: unknown;
  };

  /** Available slash commands for the session */
  export type AvailableCommands = {
    type: "available_commands";
    sessionId: string;
    commands: SlashCommandInfo[];
  };

  /** Available models for the session */
  export type AvailableModels = {
    type: "available_models";
    sessionId: string;
    models: ModelInfo[];
  };

  /** Current model selection */
  export type CurrentModel = {
    type: "current_model";
    sessionId: string;
    model: string;
  };

  /** Session status update */
  export type Status = { type: "status"; sessionId: string; message: string };

  /** Performance timing measurement */
  export type Timing = { type: "timing"; sessionId: string; entry: TimingEntry };

  // ── Task/subagent events ──

  /** Subagent task started */
  export type TaskStarted = {
    type: "task_started";
    sessionId: string;
    taskId: string;
    description: string;
    taskType?: string;
  };

  /** Subagent task progress update */
  export type TaskProgress = {
    type: "task_progress";
    sessionId: string;
    taskId: string;
    description: string;
    toolUses: number;
    durationMs: number;
    lastToolName?: string;
  };

  /** Subagent task completed notification */
  export type TaskNotification = {
    type: "task_notification";
    sessionId: string;
    taskId: string;
    status: TaskStatus;
    summary: string;
  };

  // ── Rate limiting events ──

  /** Rate limit status change */
  export type RateLimit = {
    type: "rate_limit";
    sessionId: string;
    rateLimitInfo: RateLimitInfo;
  };

  // ── Session management events ──

  /** Session context was compacted */
  export type CompactBoundary = {
    type: "compact_boundary";
    sessionId: string;
    trigger: "manual" | "auto";
    preTokens: number;
  };

  // ── User feedback events ──

  /** Local slash command output (e.g., /cost, /voice) */
  export type LocalCommandOutput = {
    type: "local_command_output";
    sessionId: string;
    content: string;
  };

  /** AI-suggested next prompt */
  export type PromptSuggestion = {
    type: "prompt_suggestion";
    sessionId: string;
    suggestion: string;
  };

  // ── File operation events ──

  /** Files persisted to disk */
  export type FilesPersisted = {
    type: "files_persisted";
    sessionId: string;
    files: PersistedFile[];
    failed: FailedFile[];
  };
}

// ---------------------------------------------------------------------------
// Stream Event Union Type
// ---------------------------------------------------------------------------

/**
 * Event types yielded by the eventIterator from main process to renderer.
 *
 * This is the primary type for handling stream events. Each event has a
 * `type` discriminator field for narrowing in switch statements.
 */
export type StreamEvent =
  // Content events
  | StreamEvents.TextDelta
  | StreamEvents.ThinkingDelta
  | StreamEvents.UserMessage
  // Tool events
  | StreamEvents.ToolUse
  | StreamEvents.ToolInputAvailable
  | StreamEvents.ToolOutputAvailable
  | StreamEvents.ToolOutputError
  // Session lifecycle events
  | StreamEvents.Result
  | StreamEvents.PermissionRequest
  | StreamEvents.AvailableCommands
  | StreamEvents.AvailableModels
  | StreamEvents.CurrentModel
  | StreamEvents.Status
  | StreamEvents.Timing
  // Task/subagent events
  | StreamEvents.TaskStarted
  | StreamEvents.TaskProgress
  | StreamEvents.TaskNotification
  // Rate limiting events
  | StreamEvents.RateLimit
  // Session management events
  | StreamEvents.CompactBoundary
  // User feedback events
  | StreamEvents.LocalCommandOutput
  | StreamEvents.PromptSuggestion
  // File operation events
  | StreamEvents.FilesPersisted;
