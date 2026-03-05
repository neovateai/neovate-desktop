import type { ClaudeCodeToolName } from "./tools";

// ---------------------------------------------------------------------------
// Agent Message Parts
// ---------------------------------------------------------------------------

/** Plain text content part */
export type TextPart = { type: "text"; text: string };

/** Extended thinking/reasoning content part */
export type ThinkingPart = { type: "thinking"; thinking: string };

/**
 * Tool invocation part that tracks a single tool call lifecycle.
 *
 * `toolName` matches a key in `claudeCodeTools` (e.g., `"Bash"`, `"Read"`).
 */
export type ToolInvocationPart = {
  type: "tool-invocation";
  toolCallId: string;
  toolName: ClaudeCodeToolName;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input: unknown;
  output?: string;
  errorText?: string;
  /** Set when this tool is a child of a Task tool */
  parentToolUseId?: string;
};

/** Lightweight status message part */
export type StatusPart = { type: "status"; message: string };

/** Discriminated union of all agent message part types */
export type AgentMessagePart = TextPart | ThinkingPart | ToolInvocationPart | StatusPart;

// ---------------------------------------------------------------------------
// Agent Message
// ---------------------------------------------------------------------------

/**
 * Parts-based agent message for UI rendering.
 *
 * Each message contains an ordered array of typed parts that can be
 * individually rendered by UI components.
 */
export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  parts: AgentMessagePart[];
};

// ---------------------------------------------------------------------------
// Cache Types
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
  toolCalls?: Array<{
    toolCallId: string;
    name: string;
    status?: string;
    input?: unknown;
  }>;
  images?: Array<{ mediaType: string; base64: string }>;
};

/** Cached parts-based agent message for persisted session display */
export type CachedAgentMessage = {
  id: string;
  role: "user" | "assistant";
  parts: AgentMessagePart[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type-safe accessor for the parent tool use ID on a ToolInvocationPart */
export function getParentToolUseId(part: ToolInvocationPart): string | undefined {
  return part.parentToolUseId;
}
