import { create } from "zustand";
import type { AgentInfo, SessionEvent } from "../../../../shared/features/acp/types";
import type { RequestPermissionRequest, SessionUpdate } from "@agentclientprotocol/sdk";

export type AcpMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
};

export type ToolCallState = {
  toolCallId: string;
  title: string;
  kind?: string;
  status?: string;
};

export type PendingPermission = {
  requestId: string;
  data: RequestPermissionRequest;
};

export type AcpSession = {
  sessionId: string;
  connectionId: string;
  messages: AcpMessage[];
  toolCalls: Map<string, ToolCallState>;
  streaming: boolean;
  promptError: string | null;
  pendingPermission: PendingPermission | null;
};

type AcpState = {
  agents: AgentInfo[];
  sessions: Map<string, AcpSession>;
  activeSessionId: string | null;

  setAgents: (agents: AgentInfo[]) => void;
  setActiveSession: (sessionId: string | null) => void;
  createSession: (sessionId: string, connectionId: string) => void;
  removeSession: (sessionId: string) => void;
  addUserMessage: (sessionId: string, content: string) => void;
  setStreaming: (sessionId: string, streaming: boolean) => void;
  setPromptError: (sessionId: string, error: string | null) => void;
  setPendingPermission: (sessionId: string, perm: PendingPermission | null) => void;
  appendChunk: (sessionId: string, event: SessionEvent) => void;
};

let messageId = 0;

export const useAcpStore = create<AcpState>((set, get) => ({
  agents: [],
  sessions: new Map(),
  activeSessionId: null,

  setAgents: (agents) => set({ agents }),

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  createSession: (sessionId, connectionId) => {
    const sessions = new Map(get().sessions);
    sessions.set(sessionId, {
      sessionId,
      connectionId,
      messages: [],
      toolCalls: new Map(),
      streaming: false,
      promptError: null,
      pendingPermission: null,
    });
    set({ sessions, activeSessionId: sessionId });
  },

  removeSession: (sessionId) => {
    const sessions = new Map(get().sessions);
    sessions.delete(sessionId);
    const activeSessionId = get().activeSessionId === sessionId ? null : get().activeSessionId;
    set({ sessions, activeSessionId });
  },

  addUserMessage: (sessionId, content) => {
    const sessions = new Map(get().sessions);
    const session = sessions.get(sessionId);
    if (!session) return;

    sessions.set(sessionId, {
      ...session,
      messages: [...session.messages, { id: String(++messageId), role: "user", content }],
    });
    set({ sessions });
  },

  setStreaming: (sessionId, streaming) => {
    const sessions = new Map(get().sessions);
    const session = sessions.get(sessionId);
    if (!session) return;

    sessions.set(sessionId, { ...session, streaming });
    set({ sessions });
  },

  setPromptError: (sessionId, promptError) => {
    const sessions = new Map(get().sessions);
    const session = sessions.get(sessionId);
    if (!session) return;

    sessions.set(sessionId, { ...session, promptError });
    set({ sessions });
  },

  setPendingPermission: (sessionId, perm) => {
    const sessions = new Map(get().sessions);
    const session = sessions.get(sessionId);
    if (!session) return;

    sessions.set(sessionId, { ...session, pendingPermission: perm });
    set({ sessions });
  },

  appendChunk: (sessionId, event) => {
    const sessions = new Map(get().sessions);
    const session = sessions.get(sessionId);
    if (!session) return;

    if (event.type === "permission_request") {
      sessions.set(sessionId, {
        ...session,
        pendingPermission: {
          requestId: event.requestId,
          data: event.data,
        },
      });
      set({ sessions });
      return;
    }

    // event.type === "update"
    const update: SessionUpdate = event.data.update;
    const messages = [...session.messages];
    const toolCalls = new Map(session.toolCalls);

    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        if (update.content.type === "text") {
          const last = messages[messages.length - 1];
          if (last && last.role === "assistant") {
            messages[messages.length - 1] = {
              ...last,
              content: last.content + update.content.text,
            };
          } else {
            messages.push({
              id: String(++messageId),
              role: "assistant",
              content: update.content.text,
            });
          }
        }
        break;
      }
      case "agent_thought_chunk": {
        if (update.content.type === "text") {
          const last = messages[messages.length - 1];
          if (last && last.role === "assistant") {
            messages[messages.length - 1] = {
              ...last,
              thinking: (last.thinking ?? "") + update.content.text,
            };
          } else {
            messages.push({
              id: String(++messageId),
              role: "assistant",
              content: "",
              thinking: update.content.text,
            });
          }
        }
        break;
      }
      case "tool_call": {
        toolCalls.set(update.toolCallId, {
          toolCallId: update.toolCallId,
          title: update.title,
          kind: update.kind,
          status: update.status,
        });
        break;
      }
      case "tool_call_update": {
        const existing = toolCalls.get(update.toolCallId);
        if (existing) {
          toolCalls.set(update.toolCallId, {
            ...existing,
            status: update.status ?? existing.status,
          });
        }
        break;
      }
    }

    sessions.set(sessionId, { ...session, messages, toolCalls });
    set({ sessions });
  },
}));
