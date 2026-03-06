import { type UIMessagePart, type UIDataTypes } from "ai";
import type { ClaudeCodeTools, ClaudeCodeToolName } from "./tools";

// ---------------------------------------------------------------------------
// UI Message Parts (extends AI SDK types with custom properties)
// ---------------------------------------------------------------------------

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

export type UIMessagePartExtended =
  | UIMessagePart<UIDataTypes, ClaudeCodeTools>
  | ToolInvocationPart;

// ---------------------------------------------------------------------------
// UI Message
// ---------------------------------------------------------------------------

/**
 * Parts-based message for UI rendering.
 *
 * Each message contains an ordered array of typed parts that can be
 * individually rendered by UI components.
 */
export type UIMessage = {
  /**
   * A unique identifier for the message.
   */
  id: string;
  /**
   * The role of the message.
   */
  role: "system" | "user" | "assistant";
  /**
   * The metadata of the message.
   */
  metadata?: unknown;
  /**
   * The parts of the message. Use this for rendering the message in the UI.
   *
   * System messages should be avoided (set the system prompt on the server instead).
   * They can have text parts.
   *
   * User messages can have text parts and file parts.
   *
   * Assistant messages can have text, reasoning, tool invocation, and file parts.
   */
  parts: UIMessagePartExtended[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type-safe accessor for the parent tool use ID on a ToolInvocationPart */
export function getParentToolUseId(part: ToolInvocationPart): string | undefined {
  return part.parentToolUseId;
}
