import debug from "debug";
import { enableMapSet } from "immer";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type {
  SessionInfo,
  SlashCommandInfo,
  ModelInfo,
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
  images?: Array<{ mediaType: string; base64: string }>;
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
  usage?: SessionUsage;
  tasks: Map<string, TaskState>;
};

type AgentState = {
  sessions: Map<string, ChatSession>;
  activeSessionId: string | null;
  agentSessions: SessionInfo[];
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
  setAvailableCommands: (sessionId: string, commands: SlashCommandInfo[]) => void;
  setAvailableModels: (sessionId: string, models: ModelInfo[]) => void;
  setCurrentModel: (sessionId: string, model: string) => void;
  renameSession: (sessionId: string, title: string) => Promise<void>;
};

export const useAgentStore = create<AgentState>()(
  immer((set) => ({
    sessions: new Map(),
    activeSessionId: null,
    agentSessions: [],
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
        session.messages.push({
          id: String(state._nextMessageId),
          role: "user",
          content,
          ...(images && images.length > 0 ? { images } : {}),
        });
        storeLog(
          "addUserMessage: msgCount=%d msgId=%d",
          session.messages.length,
          state._nextMessageId,
        );
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
