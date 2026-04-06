import type { ClaudeCodeUIEventMessage } from "../../../shared/claude-code/types";

/** Format a session event into a generic markdown string for messaging platforms. */
export function formatSessionEvent(event: ClaudeCodeUIEventMessage): string | null {
  const type = event.type;

  if (type === "tool_progress") {
    const content = (event as any).content ?? (event as any).message;
    return typeof content === "string" ? content : null;
  }

  if (type === "tool_use_summary") {
    const name = (event as any).name ?? "tool";
    const input = (event as any).input;
    return formatToolUse(name, input);
  }

  if (type === "result") {
    const subtype = (event as any).subtype;
    if (subtype === "error") {
      return `Error: ${(event as any).error ?? "Unknown error"}`;
    }
    return null;
  }

  return null;
}

function formatToolUse(name: string, input: Record<string, unknown> | undefined): string | null {
  if (!input) return `Using tool: ${name}`;

  switch (name) {
    case "bash":
    case "Bash":
      return `Running: \`${truncate(String(input.command ?? "bash"), 100)}\``;
    case "edit":
    case "Edit":
      return `Editing: \`${input.file_path ?? "file"}\``;
    case "write":
    case "Write":
      return `Writing: \`${input.file_path ?? "file"}\``;
    case "read":
    case "Read":
      return `Reading: \`${input.file_path ?? "file"}\``;
    case "glob":
    case "Glob":
      return `Searching: \`${input.pattern ?? "files"}\``;
    case "grep":
    case "Grep":
      return `Searching for: \`${truncate(String(input.pattern ?? "pattern"), 60)}\``;
    default:
      return `Using tool: ${name}`;
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/** Format a context summary from recent session messages for display on link. */
export function formatContextSummary(
  messages: Array<{ role: string; text: string }>,
  maxChars = 500,
): string {
  let total = 0;
  const lines: string[] = [];

  for (const msg of messages) {
    const prefix = msg.role === "assistant" ? "[assistant]" : `[${msg.role}]`;
    const line = `> ${prefix} ${msg.text}`;
    const truncated = line.length > 150 ? line.slice(0, 147) + "..." : line;

    if (total + truncated.length > maxChars) break;
    lines.push(truncated);
    total += truncated.length;
  }

  return lines.join("\n");
}
