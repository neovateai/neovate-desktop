export type AgentInfo = { id: string; name: string };

export type TimingEntry = {
  phase: string;
  label: string;
  durationMs: number;
  timestamp: number;
};

export type SlashCommandInfo = { name: string; description?: string };

/** What the eventIterator yields to the renderer */
export type StreamEvent =
  | { type: "text_delta"; sessionId: string; text: string }
  | { type: "thinking_delta"; sessionId: string; text: string }
  | { type: "tool_use"; sessionId: string; toolId: string; name: string; status: string }
  | { type: "user_message"; sessionId: string; text: string }
  | { type: "result"; sessionId: string; stopReason: string }
  | { type: "permission_request"; requestId: string; toolName: string; input: unknown }
  | { type: "available_commands"; sessionId: string; commands: SlashCommandInfo[] }
  | { type: "timing"; entry: TimingEntry }
  | { type: "status"; sessionId: string; message: string };

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
