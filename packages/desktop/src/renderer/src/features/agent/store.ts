import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";
import type {
  SessionInfo,
  StreamEvent,
  TimingEntry,
  SlashCommandInfo,
  CachedSession,
} from "../../../../shared/features/agent/types";
import debug from "debug";

const storeLog = debug("neovate:agent-store");

enableMapSet();

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  toolCalls?: ToolCallState[];
};

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
  messages: ChatMessage[];
  streaming: boolean;
  promptError: string | null;
  pendingPermission: PendingPermission | null;
  availableCommands: SlashCommandInfo[];
  sdkReady: boolean;
  usage?: SessionUsage;
  tasks: Map<string, TaskState>;
};

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
  addUserMessage: (sessionId: string, content: string) => void;
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

    addUserMessage: (sessionId, content) => {
      storeLog("addUserMessage: sid=%s len=%d", sessionId, content.length);
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
        session.messages.push({
          id: String(state._nextMessageId),
          role: "user",
          content,
        });
        storeLog(
          "addUserMessage: msgCount=%d msgId=%d",
          session.messages.length,
          state._nextMessageId,
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
        "restoreFromCache: sid=%s msgs=%d title=%s",
        sessionId,
        cached.messages.length,
        cached.title,
      );
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (!session) {
          storeLog("restoreFromCache: WARNING session not found sid=%s", sessionId);
          return;
        }
        session.messages = cached.messages.map((m) => {
          state._nextMessageId += 1;
          return { ...m, id: String(state._nextMessageId), toolCalls: m.toolCalls };
        });
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

          case "user_message":
            storeLog("appendChunk: user_message sid=%s len=%d", sessionId, event.text.length);
            if (!session.title) {
              session.title = event.text.slice(0, 50);
            }
            state._nextMessageId += 1;
            session.messages.push({
              id: String(state._nextMessageId),
              role: "user",
              content: event.text,
            });
            break;

          case "text_delta": {
            const last = session.messages[session.messages.length - 1];
            if (last && last.role === "assistant") {
              last.content += event.text;
              storeLog(
                "appendChunk: text_delta appended len=%d totalLen=%d",
                event.text.length,
                last.content.length,
              );
            } else {
              state._nextMessageId += 1;
              session.messages.push({
                id: String(state._nextMessageId),
                role: "assistant",
                content: event.text,
              });
              storeLog(
                "appendChunk: text_delta new assistant msg msgId=%d len=%d",
                state._nextMessageId,
                event.text.length,
              );
            }
            break;
          }

          case "thinking_delta": {
            const last = session.messages[session.messages.length - 1];
            if (last && last.role === "assistant") {
              last.thinking = (last.thinking ?? "") + event.text;
              storeLog(
                "appendChunk: thinking_delta appended len=%d totalLen=%d",
                event.text.length,
                last.thinking!.length,
              );
            } else {
              state._nextMessageId += 1;
              session.messages.push({
                id: String(state._nextMessageId),
                role: "assistant",
                content: "",
                thinking: event.text,
              });
              storeLog(
                "appendChunk: thinking_delta new assistant msg msgId=%d len=%d",
                state._nextMessageId,
                event.text.length,
              );
            }
            break;
          }

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
