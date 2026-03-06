import { type UIMessage as AIUIMessage } from "ai";
import type { ClaudeCodeTools } from "./tools";
import type { SlashCommandInfo } from "./types";

// ---------------------------------------------------------------------------
// Base Types (moved from stream-event.ts)
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
// Claude Code Data Types (for DataUIPart)
// ---------------------------------------------------------------------------

/**
 * Custom data types for Claude Code specific DataUIPart.
 * These are used with the AI SDK's DataUIPart type: `{ type: "data-${NAME}", data: ... }`
 */
export type ClaudeCodeDataTypes = {
  // Result type
  result: {
    stopReason: string;
    costUsd?: number;
    durationMs?: number;
    inputTokens?: number;
    outputTokens?: number;
    isError?: boolean;
    errors?: string[];
  };
  // Status messages
  status: { message: string };
  // Task related
  "task-started": { taskId: string; description: string; taskType?: string };
  "task-progress": {
    taskId: string;
    description: string;
    toolUses: number;
    durationMs: number;
    lastToolName?: string;
  };
  "task-notification": { taskId: string; status: string; summary: string };
  // Permission request (sent via emitter)
  "permission-request": {
    requestId: string;
    toolName: string;
    input: unknown;
  };
  // Other metadata
  "available-commands": { commands: SlashCommandInfo[] };
  "compact-boundary": { trigger: string; preTokens: number };
  "local-command-output": { content: string };
  "files-persisted": { files: PersistedFile[]; failed: FailedFile[] };
  "rate-limit": { rateLimitInfo: RateLimitInfo };
  "prompt-suggestion": { suggestion?: string };
  timing: { phase: string; label: string; durationMs: number; timestamp: number };
};

// ---------------------------------------------------------------------------
// UI Message Parts (extends AI SDK types with custom properties)
// ---------------------------------------------------------------------------

/**
 * Dynamic tool part type for tool invocations.
 * This is the standard AI SDK type for tool calls where the tool name is dynamic.
 */
export type DynamicToolPart = Extract<UIMessagePart, { type: "dynamic-tool" }>;

// ---------------------------------------------------------------------------
// UI Message
// ---------------------------------------------------------------------------

/**
 * Parts-based message for UI rendering.
 *
 * Each message contains an ordered array of typed parts that can be
 * individually rendered by UI components.
 */
export type UIMessage = AIUIMessage<unknown, ClaudeCodeDataTypes, ClaudeCodeTools>;

export type UIMessagePart = UIMessage["parts"][number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type-safe accessor for the parent tool use ID from callProviderMetadata */
export function getParentToolUseId(part: DynamicToolPart): string | undefined {
  const metadata = part.callProviderMetadata as
    | { context?: { parentToolUseId?: string } }
    | undefined;
  return metadata?.context?.parentToolUseId;
}
