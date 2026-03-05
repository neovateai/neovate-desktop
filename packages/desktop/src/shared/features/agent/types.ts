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
  | {
      type: "tool_use";
      sessionId: string;
      toolId: string;
      name: string;
      status: string;
      input?: unknown;
    }
  | { type: "user_message"; sessionId: string; text: string }
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
    };

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

/** Cached message for persisted session display */
export type CachedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  toolCalls?: Array<{ toolCallId: string; name: string; status?: string; input?: unknown }>;
};

/** Persisted session cache for instant resume */
export type CachedSession = {
  messages: CachedMessage[];
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
