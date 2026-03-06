import { type UITools, type UIDataTypes, type UIMessage } from "ai";
import type { ClaudeCodeToolName } from "./tools";

// ---------------------------------------------------------------------------
// Rendering Message Parts
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

// ---------------------------------------------------------------------------
// Rendering Message
// ---------------------------------------------------------------------------

/**
 * Parts-based message for UI rendering.
 *
 * Each message contains an ordered array of typed parts that can be
 * individually rendered by UI components.
 */
export type RenderingMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
> = UIMessage<METADATA, DATA_PARTS, TOOLS>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type-safe accessor for the parent tool use ID on a ToolInvocationPart */
export function getParentToolUseId(part: ToolInvocationPart): string | undefined {
  return part.parentToolUseId;
}
