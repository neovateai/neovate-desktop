import debug from "debug";
import { enableMapSet } from "immer";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type {
  SessionInfo,
  SlashCommandInfo,
  ModelInfo,
  ModelScope,
  PermissionMode,
} from "../../../../shared/features/agent/types";

import { client } from "../../orpc";

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
  contextWindowSize: number;
  contextUsedTokens: number;
  remainingPct: number;
};

export type ChatSession = {
  sessionId: string;
  cwd?: string;
  title?: string;
  createdAt: string;
  isNew: boolean;
  messages: ChatMessage[];
  availableCommands: SlashCommandInfo[];
  availableModels: ModelInfo[];
  currentModel?: string;
  modelScope?: ModelScope;
  providerId?: string;
  permissionMode?: PermissionMode;
  usage?: SessionUsage;
  tasks: Map<string, TaskState>;
};

export type TurnResult = "success" | "error";

type AgentState = {
  sessions: Map<string, ChatSession>;
  activeSessionId: string | null;
  agentSessions: SessionInfo[];
  sessionsLoaded: boolean;
  unseenTurnResults: Map<string, TurnResult>;
  _nextMessageId: number;

  setActiveSession: (sessionId: string | null) => void;
  setAgentSessions: (sessions: SessionInfo[]) => void;
  markTurnCompleted: (sessionId: string, result: TurnResult) => void;
  clearTurnResult: (sessionId: string) => void;
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
  setAvailableCommands: (sessionId: string, commands: SlashCommandInfo[]) => void;
  setAvailableModels: (sessionId: string, models: ModelInfo[]) => void;
  setCurrentModel: (sessionId: string, model: string) => void;
  setModelScope: (sessionId: string, scope: ModelScope | undefined) => void;
  setProviderId: (sessionId: string, providerId: string | undefined) => void;
  setPermissionMode: (sessionId: string, mode: PermissionMode) => void;
  setSessionUsage: (
    sessionId: string,
    usage: { contextWindowSize: number; usedTokens: number; remainingPct: number },
  ) => void;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  pendingDeeplink: { sessionId: string; project: string } | null;
  setPendingDeeplink: (dl: { sessionId: string; project: string } | null) => void;
  sessionInitError: string | null;
  setSessionInitError: (error: string | null) => void;
};

export const useAgentStore = create<AgentState>()(
  immer((set, get) => ({
    sessions: new Map(),
    activeSessionId: null,
    agentSessions: [],
    sessionsLoaded: false,
    unseenTurnResults: new Map(),
    pendingDeeplink: null,
    sessionInitError: null,
    _nextMessageId: 0,

    setActiveSession: (sessionId) => {
      storeLog("setActiveSession: %s", sessionId);
      set((state) => {
        state.activeSessionId = sessionId;
        if (sessionId) state.unseenTurnResults.delete(sessionId);
      });
    },

    markTurnCompleted: (sessionId, result) => {
      storeLog("markTurnCompleted: sid=%s result=%s", sessionId, result);
      set((state) => {
        state.unseenTurnResults.set(sessionId, result);
      });
    },

    clearTurnResult: (sessionId) => {
      storeLog("clearTurnResult: sid=%s", sessionId);
      set((state) => {
        state.unseenTurnResults.delete(sessionId);
      });
    },

    setAgentSessions: (agentSessions) => {
      storeLog("setAgentSessions: count=%d", agentSessions.length);
      set({ agentSessions, sessionsLoaded: true });
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
          availableCommands: [],
          availableModels: [],
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
          availableCommands: [],
          availableModels: [],
          tasks: new Map(),
        });
        storeLog("createBackgroundSession: totalSessions=%d (not activated)", state.sessions.size);
      });
    },

    removeSession: (sessionId) => {
      storeLog("removeSession: sid=%s", sessionId);
      set((state) => {
        state.sessions.delete(sessionId);
        state.unseenTurnResults.delete(sessionId);
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
      const wasNew = get().sessions.get(sessionId)?.isNew;
      const createdAt = wasNew ? new Date().toISOString() : undefined;
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (!session) {
          storeLog("addUserMessage: WARNING session not found sid=%s", sessionId);
          return;
        }
        if (createdAt) {
          session.createdAt = createdAt;
          const info = state.agentSessions.find((s) => s.sessionId === sessionId);
          if (info) info.createdAt = createdAt;
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
      if (createdAt) {
        client.agent.updateSessionStartTime({ sessionId, createdAt }).catch(() => {});
      }
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

    setAvailableModels: (sessionId, models) => {
      storeLog(
        "setAvailableModels: sid=%s models=%o",
        sessionId,
        models.map((m) => m.value),
      );
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.availableModels = models;
      });
    },

    setCurrentModel: (sessionId, model) => {
      storeLog("setCurrentModel: sid=%s model=%s", sessionId, model);
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.currentModel = model;
      });
    },

    setModelScope: (sessionId, scope) => {
      storeLog("setModelScope: sid=%s scope=%s", sessionId, scope);
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.modelScope = scope;
      });
    },

    setProviderId: (sessionId, providerId) => {
      storeLog("setProviderId: sid=%s providerId=%s", sessionId, providerId);
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.providerId = providerId;
      });
    },

    setPermissionMode: (sessionId, mode) => {
      storeLog("setPermissionMode: sid=%s mode=%s", sessionId, mode);
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.permissionMode = mode;
      });
    },

    setSessionUsage: (sessionId, usage) => {
      storeLog("setSessionUsage: sid=%s remaining=%d%%", sessionId, usage.remainingPct);
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (!session) return;
        session.usage = {
          ...session.usage,
          totalCostUsd: session.usage?.totalCostUsd ?? 0,
          totalDurationMs: session.usage?.totalDurationMs ?? 0,
          totalInputTokens: session.usage?.totalInputTokens ?? 0,
          totalOutputTokens: session.usage?.totalOutputTokens ?? 0,
          contextWindowSize: usage.contextWindowSize,
          contextUsedTokens: usage.usedTokens,
          remainingPct: usage.remainingPct,
        };
      });
    },

    setPendingDeeplink: (dl) => {
      storeLog("setPendingDeeplink: %o", dl);
      set({ pendingDeeplink: dl });
    },

    setSessionInitError: (error) => {
      set({ sessionInitError: error });
    },

    renameSession: async (sessionId, title) => {
      storeLog("renameSession: sid=%s title=%s", sessionId, title);
      await client.agent.renameSession({ sessionId, title });
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.title = title;
        const info = state.agentSessions.find((s) => s.sessionId === sessionId);
        if (info) info.title = title;
      });
    },
  })),
);
