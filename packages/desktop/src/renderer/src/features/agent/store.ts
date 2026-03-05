import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";
import type {
  SessionInfo,
  StreamEvent,
  TimingEntry,
  SlashCommandInfo,
  CachedSession,
  AgentMessage,
  AgentMessagePart,
  ToolInvocationPart,
} from "../../../../shared/features/agent/types";
import type { ClaudeCodeToolName } from "../../../../shared/features/agent/tools";
import debug from "debug";

const storeLog = debug("neovate:agent-store");

enableMapSet();

/**
 * @deprecated Use {@link AgentMessage} from shared types instead.
 * Flat message type kept for backward compatibility.
 */
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  toolCalls?: ToolCallState[];
  images?: Array<{ mediaType: string; base64: string }>;
};

/**
 * @deprecated Tool state is now embedded in `AgentMessage.parts` as `ToolInvocationPart`.
 */
export type ToolCallState = {
  toolCallId: string;
  name: string;
  status?: string;
  input?: unknown;
};

export type PendingPermission = {
  requestId: string;
  toolName: string;
  input: unknown;
};

export type TaskState = {
  taskId: string;
  description: string;
  taskType?: string;
  status: "running" | "completed" | "failed" | "stopped";
  toolUses?: number;
  durationMs?: number;
  lastToolName?: string;
  summary?: string;
};

export type SessionUsage = {
  totalCostUsd: number;
  totalDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

export type ChatSession = {
  sessionId: string;
  cwd?: string;
  title?: string;
  createdAt: string;
  isNew: boolean;
  /**
   * @deprecated Use `agentMessages` for parts-based rendering.
   * Kept for backward compatibility — both are populated in parallel.
   */
  messages: ChatMessage[];
  /** Parts-based message list for the new rendering pipeline. */
  agentMessages: AgentMessage[];
  streaming: boolean;
  promptError: string | null;
  pendingPermission: PendingPermission | null;
  availableCommands: SlashCommandInfo[];
  sdkReady: boolean;
  usage?: SessionUsage;
  tasks: Map<string, TaskState>;
};

// ---------------------------------------------------------------------------
// Selector helpers
// ---------------------------------------------------------------------------

/** Extract all tool invocation parts from an agent message. */
export function selectToolParts(message: AgentMessage): ToolInvocationPart[] {
  return message.parts.filter((p): p is ToolInvocationPart => p.type === "tool-invocation");
}

/** Extract the concatenated text content from an agent message. */
export function selectTextContent(message: AgentMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Extract child tool parts belonging to a given parent tool call. */
export function selectChildToolParts(
  message: AgentMessage,
  parentToolCallId: string,
): ToolInvocationPart[] {
  return message.parts.filter(
    (p): p is ToolInvocationPart =>
      p.type === "tool-invocation" && p.parentToolUseId === parentToolCallId,
  );
}

type AgentState = {
  sessions: Map<string, ChatSession>;
  activeSessionId: string | null;
  agentSessions: SessionInfo[];
  timings: TimingEntry[];
  _nextMessageId: number;

  setActiveSession: (sessionId: string | null) => void;
  setAgentSessions: (sessions: SessionInfo[]) => void;
  createSession: (
    sessionId: string,
    meta?: { title?: string; createdAt?: string; cwd?: string; isNew?: boolean },
  ) => void;
  createBackgroundSession: (
    sessionId: string,
    meta?: { title?: string; createdAt?: string; cwd?: string; isNew?: boolean },
  ) => void;
  removeSession: (sessionId: string) => void;
  addUserMessage: (
    sessionId: string,
    content: string,
    images?: Array<{ mediaType: string; base64: string }>,
  ) => void;
  setStreaming: (sessionId: string, streaming: boolean) => void;
  setPromptError: (sessionId: string, error: string | null) => void;
  setPendingPermission: (sessionId: string, perm: PendingPermission | null) => void;
  setAvailableCommands: (sessionId: string, commands: SlashCommandInfo[]) => void;
  appendChunk: (sessionId: string, event: StreamEvent) => void;
  restoreFromCache: (sessionId: string, cached: CachedSession) => void;
  setSdkReady: (sessionId: string, ready: boolean) => void;
  addTiming: (entry: TimingEntry) => void;
  clearTimings: () => void;
};

export const useAgentStore = create<AgentState>()(
  immer((set) => ({
    sessions: new Map(),
    activeSessionId: null,
    agentSessions: [],
    timings: [],
    _nextMessageId: 0,

    setActiveSession: (sessionId) => {
      storeLog("setActiveSession: %s", sessionId);
      set({ activeSessionId: sessionId });
    },

    setAgentSessions: (agentSessions) => {
      storeLog("setAgentSessions: count=%d", agentSessions.length);
      set({ agentSessions });
    },

    createSession: (sessionId, meta) => {
      storeLog("createSession: sid=%s meta=%o", sessionId, meta);
      set((state) => {
        state.sessions.set(sessionId, {
          sessionId,
          cwd: meta?.cwd,
          title: meta?.title,
          createdAt: meta?.createdAt ?? new Date().toISOString(),
          isNew: meta?.isNew ?? false,
          messages: [],
          agentMessages: [],
          streaming: false,
          promptError: null,
          pendingPermission: null,
          availableCommands: [],
          sdkReady: true,
          tasks: new Map(),
        });
        state.activeSessionId = sessionId;
        storeLog("createSession: totalSessions=%d active=%s", state.sessions.size, sessionId);
      });
    },

    createBackgroundSession: (sessionId, meta) => {
      storeLog("createBackgroundSession: sid=%s meta=%o", sessionId, meta);
      set((state) => {
        state.sessions.set(sessionId, {
          sessionId,
          cwd: meta?.cwd,
          title: meta?.title,
          createdAt: meta?.createdAt ?? new Date().toISOString(),
          isNew: meta?.isNew ?? false,
          messages: [],
          agentMessages: [],
          streaming: false,
          promptError: null,
          pendingPermission: null,
          availableCommands: [],
          sdkReady: true,
          tasks: new Map(),
        });
        storeLog("createBackgroundSession: totalSessions=%d (not activated)", state.sessions.size);
      });
    },

    removeSession: (sessionId) => {
      storeLog("removeSession: sid=%s", sessionId);
      set((state) => {
        state.sessions.delete(sessionId);
        if (state.activeSessionId === sessionId) {
          state.activeSessionId = null;
        }
        storeLog(
          "removeSession: totalSessions=%d active=%s",
          state.sessions.size,
          state.activeSessionId,
        );
      });
    },

    addUserMessage: (sessionId, content, images) => {
      storeLog(
        "addUserMessage: sid=%s len=%d images=%d",
        sessionId,
        content.length,
        images?.length ?? 0,
      );
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (!session) {
          storeLog("addUserMessage: WARNING session not found sid=%s", sessionId);
          return;
        }
        session.isNew = false;
        if (!session.title) {
          session.title = content.slice(0, 50);
        }
        state._nextMessageId += 1;
        const msgId = String(state._nextMessageId);
        // Legacy
        session.messages.push({
          id: String(state._nextMessageId),
          role: "user",
          content,
          ...(images && images.length > 0 ? { images } : {}),
        });
        // Parts-based
        session.agentMessages.push({
          id: msgId,
          role: "user",
          parts: [
            {
              type: "text",
              text: content,
              ...(images && images.length > 0 ? { images } : {}),
            },
          ],
        });
        storeLog(
          "addUserMessage: msgCount=%d agentMsgCount=%d msgId=%s",
          session.messages.length,
          session.agentMessages.length,
          msgId,
        );
      });
    },

    setStreaming: (sessionId, streaming) => {
      storeLog("setStreaming: sid=%s streaming=%s", sessionId, streaming);
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.streaming = streaming;
      });
    },

    setPromptError: (sessionId, promptError) => {
      storeLog("setPromptError: sid=%s error=%s", sessionId, promptError);
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.promptError = promptError;
      });
    },

    setPendingPermission: (sessionId, perm) => {
      storeLog(
        "setPendingPermission: sid=%s perm=%o",
        sessionId,
        perm ? { requestId: perm.requestId, toolName: perm.toolName } : null,
      );
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.pendingPermission = perm;
      });
    },

    setAvailableCommands: (sessionId, commands) => {
      storeLog(
        "setAvailableCommands: sid=%s commands=%o",
        sessionId,
        commands.map((c) => c.name),
      );
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.availableCommands = commands;
      });
    },

    addTiming: (entry) => {
      storeLog(
        "addTiming: phase=%s label=%s durationMs=%d",
        entry.phase,
        entry.label,
        entry.durationMs,
      );
      set((state) => {
        state.timings.push(entry);
      });
    },

    clearTimings: () => set({ timings: [] }),

    restoreFromCache: (sessionId, cached) => {
      storeLog(
        "restoreFromCache: sid=%s msgs=%d agentMsgs=%d title=%s",
        sessionId,
        cached.messages.length,
        cached.agentMessages?.length ?? 0,
        cached.title,
      );
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (!session) {
          storeLog("restoreFromCache: WARNING session not found sid=%s", sessionId);
          return;
        }
        // @deprecated Legacy messages
        session.messages = cached.messages.map((m) => {
          state._nextMessageId += 1;
          return {
            ...m,
            id: String(state._nextMessageId),
            toolCalls: m.toolCalls,
            images: m.images,
          };
        });
        // Parts-based messages
        if (Array.isArray(cached.agentMessages) && cached.agentMessages.length > 0) {
          session.agentMessages = cached.agentMessages.map((m) => {
            state._nextMessageId += 1;
            return { ...m, id: String(state._nextMessageId) };
          });
        } else {
          // @deprecated Fallback: convert legacy messages to basic AgentMessage format
          session.agentMessages = cached.messages.map((m) => {
            state._nextMessageId += 1;
            const parts: AgentMessagePart[] = [];
            if (m.thinking) {
              parts.push({ type: "thinking", thinking: m.thinking });
            }
            if (m.content) {
              parts.push({ type: "text", text: m.content });
            }
            return { id: String(state._nextMessageId), role: m.role, parts };
          });
        }
        if (cached.title) session.title = cached.title;
        if (cached.cwd) session.cwd = cached.cwd;
        if (cached.usage) session.usage = cached.usage;
        session.sdkReady = false;
      });
    },

    setSdkReady: (sessionId, ready) => {
      storeLog("setSdkReady: sid=%s ready=%s", sessionId, ready);
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.sdkReady = ready;
      });
    },

    appendChunk: (sessionId, event) => {
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (!session) {
          storeLog(
            "appendChunk: WARNING session not found sid=%s eventType=%s",
            sessionId,
            event.type,
          );
          return;
        }

        // ── Helper: get or create the last assistant AgentMessage ──
        const getOrCreateAssistantAgentMsg = () => {
          const last = session.agentMessages[session.agentMessages.length - 1];
          if (last && last.role === "assistant") return last;
          state._nextMessageId += 1;
          const msg: AgentMessage = {
            id: `am-${state._nextMessageId}`,
            role: "assistant",
            parts: [],
          };
          session.agentMessages.push(msg);
          return msg;
        };

        switch (event.type) {
          case "timing":
            storeLog(
              "appendChunk: timing phase=%s label=%s durationMs=%d",
              event.entry.phase,
              event.entry.label,
              event.entry.durationMs,
            );
            state.timings.push(event.entry);
            break;

          case "permission_request":
            storeLog(
              "appendChunk: permission_request requestId=%s tool=%s",
              event.requestId,
              event.toolName,
            );
            session.pendingPermission = {
              requestId: event.requestId,
              toolName: event.toolName,
              input: event.input,
            };
            break;

          case "available_commands":
            storeLog(
              "appendChunk: available_commands sid=%s count=%d names=%o",
              sessionId,
              event.commands.length,
              event.commands.map((c) => c.name),
            );
            session.availableCommands = event.commands;
            break;

          case "user_message": {
            storeLog(
              "appendChunk: user_message sid=%s len=%d images=%d",
              sessionId,
              event.text.length,
              event.images?.length ?? 0,
            );
            if (!session.title) {
              session.title = event.text.slice(0, 50);
            }
            state._nextMessageId += 1;
            const umId = String(state._nextMessageId);
            // Legacy
            session.messages.push({
              id: String(state._nextMessageId),
              role: "user",
              content: event.text,
              ...(event.images && event.images.length > 0 ? { images: event.images } : {}),
            });
            // Parts-based
            session.agentMessages.push({
              id: `am-${umId}`,
              role: "user",
              parts: [
                {
                  type: "text",
                  text: event.text,
                  ...(event.images && event.images.length > 0 ? { images: event.images } : {}),
                },
              ],
            });
            break;
          }

          case "text_delta": {
            // ── Legacy ──
            const last = session.messages[session.messages.length - 1];
            if (last && last.role === "assistant") {
              last.content += event.text;
            } else {
              state._nextMessageId += 1;
              session.messages.push({
                id: String(state._nextMessageId),
                role: "assistant",
                content: event.text,
              });
            }
            // ── Parts-based ──
            const amMsg = getOrCreateAssistantAgentMsg();
            const lastPart = amMsg.parts[amMsg.parts.length - 1];
            if (lastPart && lastPart.type === "text") {
              lastPart.text += event.text;
            } else {
              amMsg.parts.push({ type: "text", text: event.text });
            }
            break;
          }

          case "thinking_delta": {
            // ── Legacy ──
            const last = session.messages[session.messages.length - 1];
            if (last && last.role === "assistant") {
              last.thinking = (last.thinking ?? "") + event.text;
            } else {
              state._nextMessageId += 1;
              session.messages.push({
                id: String(state._nextMessageId),
                role: "assistant",
                content: "",
                thinking: event.text,
              });
            }
            // ── Parts-based ──
            const amMsg = getOrCreateAssistantAgentMsg();
            const lastPart = amMsg.parts[amMsg.parts.length - 1];
            if (lastPart && lastPart.type === "thinking") {
              lastPart.thinking += event.text;
            } else {
              amMsg.parts.push({ type: "thinking", thinking: event.text });
            }
            break;
          }

          // @deprecated Legacy — still populate toolCalls map
          case "tool_use": {
            storeLog(
              "appendChunk: tool_use id=%s name=%s status=%s",
              event.toolId,
              event.name,
              event.status,
            );
            let last = session.messages[session.messages.length - 1];
            if (!last || last.role !== "assistant") {
              state._nextMessageId += 1;
              last = {
                id: String(state._nextMessageId),
                role: "assistant",
                content: "",
                toolCalls: [],
              };
              session.messages.push(last);
            }
            if (!last.toolCalls) last.toolCalls = [];
            const existing = last.toolCalls.find((tc) => tc.toolCallId === event.toolId);
            if (existing) {
              existing.status = event.status;
              if ("input" in event) existing.input = event.input;
            } else {
              last.toolCalls.push({
                toolCallId: event.toolId,
                name: event.name,
                status: event.status,
                ...("input" in event ? { input: event.input } : {}),
              });
            }
            break;
          }

          // ── New structured tool events ──

          case "tool_input_available": {
            storeLog(
              "appendChunk: tool_input_available id=%s name=%s parent=%s",
              event.toolCallId,
              event.toolName,
              event.parentToolUseId ?? "-",
            );
            const amMsg = getOrCreateAssistantAgentMsg();
            amMsg.parts.push({
              type: "tool-invocation",
              toolCallId: event.toolCallId,
              toolName: event.toolName as ClaudeCodeToolName,
              state: "input-available",
              input: event.input,
              parentToolUseId: event.parentToolUseId,
            });
            break;
          }

          case "tool_output_available": {
            storeLog(
              "appendChunk: tool_output_available id=%s outputLen=%d",
              event.toolCallId,
              event.output.length,
            );
            // Find the matching tool invocation part across all messages
            for (const msg of session.agentMessages) {
              for (const part of msg.parts) {
                if (part.type === "tool-invocation" && part.toolCallId === event.toolCallId) {
                  part.state = "output-available";
                  part.output = event.output;
                  break;
                }
              }
            }
            break;
          }

          case "tool_output_error": {
            storeLog(
              "appendChunk: tool_output_error id=%s error=%s",
              event.toolCallId,
              event.errorText.slice(0, 80),
            );
            // Find the matching tool invocation part across all messages
            for (const msg of session.agentMessages) {
              for (const part of msg.parts) {
                if (part.type === "tool-invocation" && part.toolCallId === event.toolCallId) {
                  part.state = "output-error";
                  part.errorText = event.errorText;
                  break;
                }
              }
            }
            break;
          }

          case "result":
            storeLog("appendChunk: result stopReason=%s sid=%s", event.stopReason, sessionId);
            if (event.stopReason === "error") {
              session.promptError = "Session failed to load";
            }
            if (event.costUsd != null || event.inputTokens != null || event.outputTokens != null) {
              if (!session.usage) {
                session.usage = {
                  totalCostUsd: 0,
                  totalDurationMs: 0,
                  totalInputTokens: 0,
                  totalOutputTokens: 0,
                };
              }
              session.usage.totalCostUsd += event.costUsd ?? 0;
              session.usage.totalDurationMs += event.durationMs ?? 0;
              session.usage.totalInputTokens += event.inputTokens ?? 0;
              session.usage.totalOutputTokens += event.outputTokens ?? 0;
            }
            break;

          case "status":
            storeLog("appendChunk: status message=%s sid=%s", event.message, sessionId);
            break;

          case "task_started":
            storeLog("appendChunk: task_started id=%s desc=%s", event.taskId, event.description);
            session.tasks.set(event.taskId, {
              taskId: event.taskId,
              description: event.description,
              taskType: event.taskType,
              status: "running",
            });
            break;

          case "task_progress":
            storeLog("appendChunk: task_progress id=%s tools=%d", event.taskId, event.toolUses);
            {
              const task = session.tasks.get(event.taskId);
              if (task) {
                task.description = event.description;
                task.toolUses = event.toolUses;
                task.durationMs = event.durationMs;
                task.lastToolName = event.lastToolName;
              }
            }
            break;

          case "task_notification":
            storeLog("appendChunk: task_notification id=%s status=%s", event.taskId, event.status);
            {
              const task = session.tasks.get(event.taskId);
              if (task) {
                task.status = event.status;
                task.summary = event.summary;
              }
            }
            break;
        }
      });
    },
  })),
);
