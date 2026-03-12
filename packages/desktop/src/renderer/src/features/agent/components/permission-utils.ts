import type { PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import type { BundledLanguage } from "shiki";

import type { ClaudeCodeUIEventRequest } from "../../../../../shared/claude-code/types";
import type { PermissionMode } from "../../../../../shared/features/agent/types";

// ─── Suggestion Label ───────────────────────────────────────────────────────

const DESTINATION_SCOPE: Record<string, string> = {
  session: "this session",
  projectSettings: "in this project",
  userSettings: "globally",
  localSettings: "locally",
};

const DESTINATION_FILE: Record<string, string> = {
  projectSettings: ".claude/settings.json",
  localSettings: ".claude/settings.local.json",
  userSettings: "~/.claude/settings.json",
};

function scopeLabel(destination: string): string {
  return DESTINATION_SCOPE[destination] ?? "this session";
}

/**
 * Build a human-readable label from SDK permission suggestions.
 * Mirrors Claude Code CLI's contextual "always allow" labels.
 */
export function formatSuggestionLabel(suggestions: PermissionUpdate[]): string {
  const directories: string[] = [];
  const readPaths: string[] = [];
  const bashCommands: string[] = [];
  let modeChange: { mode: string; destination: string } | null = null;
  let primaryDestination = "session";

  for (const s of suggestions) {
    if (s.type === "addDirectories") {
      directories.push(...s.directories.map((d) => d.split("/").pop() || d));
      primaryDestination = s.destination;
    } else if (s.type === "addRules" || s.type === "replaceRules") {
      for (const rule of s.rules) {
        if (rule.toolName === "Read") {
          const name = rule.ruleContent?.replace("/**", "").split("/").pop() || rule.ruleContent;
          if (name) readPaths.push(name);
        } else if (rule.toolName === "Bash") {
          if (rule.ruleContent) bashCommands.push(rule.ruleContent);
        }
      }
      primaryDestination = s.destination;
    } else if (s.type === "setMode") {
      modeChange = { mode: s.mode, destination: s.destination };
    }
  }

  if (modeChange) {
    const modeLabel =
      modeChange.mode === "bypassPermissions"
        ? "YOLO"
        : modeChange.mode === "acceptEdits"
          ? "Auto Edit"
          : modeChange.mode;
    return `switch to ${modeLabel} mode for ${scopeLabel(modeChange.destination)}`;
  }

  const scope = scopeLabel(primaryDestination);
  const hasDirs = directories.length > 0;
  const hasRead = readPaths.length > 0;
  const hasBash = bashCommands.length > 0;

  if (hasRead && !hasDirs && !hasBash) {
    return `allow reading from ${formatNames(readPaths)} ${scope}`;
  }
  if (hasDirs && !hasRead && !hasBash) {
    return `always allow access to ${formatNames(directories)} ${scope}`;
  }
  if (hasBash && !hasDirs && !hasRead) {
    const cmds = bashCommands.length > 2 ? "similar" : formatNames(bashCommands);
    return `don't ask again for ${cmds} commands ${scope}`;
  }
  if ((hasDirs || hasRead) && hasBash) {
    const paths = [...directories, ...readPaths];
    return `allow ${formatNames(paths)} access and ${formatNames(bashCommands)} commands`;
  }
  if (hasDirs || hasRead) {
    return `always allow access to ${formatNames([...directories, ...readPaths])} ${scope}`;
  }

  return `always allow for ${scope}`;
}

function formatNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

/**
 * Get the settings file path that a suggestion set will write to.
 * Returns null for session-only (in-memory) suggestions.
 */
export function getSuggestionPersistencePath(suggestions: PermissionUpdate[]): string | null {
  for (const s of suggestions) {
    const dest = "destination" in s ? s.destination : undefined;
    if (dest && dest in DESTINATION_FILE) {
      return DESTINATION_FILE[dest];
    }
  }
  return null;
}

// ─── Tool Preview ───────────────────────────────────────────────────────────

export type ToolPreviewInfo = {
  title: string;
  subtitle?: string;
  code?: string;
  language?: BundledLanguage;
};

/**
 * Extract a human-friendly preview from tool input.
 */
export function formatToolPreview(
  toolName: string,
  input: Record<string, unknown>,
): ToolPreviewInfo {
  switch (toolName) {
    case "Bash": {
      const command = (input.command as string) ?? "";
      const description = input.description as string | undefined;
      return {
        title: "Bash",
        subtitle: description,
        code: `$ ${command}`,
        language: "bash",
      };
    }
    case "Edit":
    case "MultiEdit":
      return {
        title: toolName,
        subtitle: (input.file_path as string) ?? (input.filePath as string),
      };
    case "Write":
      return {
        title: "Write",
        subtitle: (input.file_path as string) ?? (input.filePath as string),
      };
    case "Read":
      return {
        title: "Read",
        subtitle: (input.file_path as string) ?? (input.filePath as string),
      };
    case "Glob":
      return {
        title: "Glob",
        subtitle: [input.pattern, input.path].filter(Boolean).join(" in "),
      };
    case "Grep":
      return {
        title: "Grep",
        subtitle: [input.pattern, input.path].filter(Boolean).join(" in "),
      };
    case "WebFetch":
      return { title: "WebFetch", subtitle: input.url as string };
    case "WebSearch":
      return { title: "WebSearch", subtitle: input.query as string };
    default:
      return {
        title: toolName,
        subtitle: truncateJSON(input),
      };
  }
}

function truncateJSON(obj: Record<string, unknown>): string {
  const text = JSON.stringify(obj, null, 2);
  const lines = text.split("\n");
  if (lines.length <= 4) return text;
  return lines.slice(0, 4).join("\n") + "\n...";
}

// ─── Decision Reason ────────────────────────────────────────────────────────

const MODE_LABELS: Record<PermissionMode, string> = {
  default: "Default mode",
  acceptEdits: "Auto Edit mode",
  plan: "Plan mode",
  bypassPermissions: "YOLO mode",
  dontAsk: "Don't Ask mode",
};

/**
 * Infer a human-readable decision reason from permission mode and options.
 */
export function inferDecisionReason(
  permissionMode: PermissionMode,
  options: ClaudeCodeUIEventRequest["options"],
): string {
  const mode = MODE_LABELS[permissionMode] ?? "Default mode";
  const blockedPath = options.blockedPath;
  if (blockedPath) {
    return `${mode} — blocked access to ${blockedPath}`;
  }
  return mode;
}
