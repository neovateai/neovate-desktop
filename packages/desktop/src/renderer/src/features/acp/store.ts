import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";
import type { AgentInfo, SessionInfo, StreamEvent } from "../../../../shared/features/acp/types";
import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";

enableMapSet();

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
  cwd?: string;
  title?: string;
  createdAt: string;
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
  activeConnectionId: string | null;
  agentSessions: SessionInfo[];
  _nextMessageId: number;

  setAgents: (agents: AgentInfo[]) => void;
  setActiveSession: (sessionId: string | null) => void;
  setActiveConnectionId: (connectionId: string | null) => void;
  setAgentSessions: (sessions: SessionInfo[]) => void;
  createSession: (
    sessionId: string,
    connectionId: string,
    meta?: { title?: string; createdAt?: string; cwd?: string },
  ) => void;
  removeSession: (sessionId: string) => void;
  addUserMessage: (sessionId: string, content: string) => void;
  setStreaming: (sessionId: string, streaming: boolean) => void;
  setPromptError: (sessionId: string, error: string | null) => void;
  setPendingPermission: (sessionId: string, perm: PendingPermission | null) => void;
  appendChunk: (sessionId: string, event: StreamEvent) => void;
};

export const useAcpStore = create<AcpState>()(
  immer((set) => ({
    agents: [],
    sessions: new Map(),
    activeSessionId: null,
    activeConnectionId: null,
    agentSessions: [],
    _nextMessageId: 0,

    setAgents: (agents) => set({ agents }),

    setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

    setActiveConnectionId: (activeConnectionId) => set({ activeConnectionId }),

    setAgentSessions: (agentSessions) => set({ agentSessions }),

    createSession: (sessionId, connectionId, meta) => {
      set((state) => {
        state.sessions.set(sessionId, {
          sessionId,
          connectionId,
          cwd: meta?.cwd,
          title: meta?.title,
          createdAt: meta?.createdAt ?? new Date().toISOString(),
          messages: [],
          toolCalls: new Map(),
          streaming: false,
          promptError: null,
          pendingPermission: null,
        });
        state.activeSessionId = sessionId;
      });
    },

    removeSession: (sessionId) => {
      set((state) => {
        state.sessions.delete(sessionId);
        if (state.activeSessionId === sessionId) {
          state.activeSessionId = null;
        }
      });
    },

    addUserMessage: (sessionId, content) => {
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (!session) return;
        if (!session.title) {
          session.title = content.slice(0, 50);
        }
        state._nextMessageId += 1;
        session.messages.push({
          id: String(state._nextMessageId),
          role: "user",
          content,
        });
      });
    },

    setStreaming: (sessionId, streaming) => {
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.streaming = streaming;
      });
    },

    setPromptError: (sessionId, promptError) => {
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.promptError = promptError;
      });
    },

    setPendingPermission: (sessionId, perm) => {
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.pendingPermission = perm;
      });
    },

    appendChunk: (sessionId, event) => {
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (!session) return;

        if (event.type === "permission_request") {
          session.pendingPermission = {
            requestId: event.requestId,
            data: event.data,
          };
          return;
        }

        if (event.type === "user_message") {
          if (!session.title) {
            session.title = event.text.slice(0, 50);
          }
          state._nextMessageId += 1;
          session.messages.push({
            id: String(state._nextMessageId),
            role: "user",
            content: event.text,
          });
          return;
        }

        // event.type === "acpx_event"
        const acpxEvent = event.event;

        switch (acpxEvent.type) {
          case "output_delta": {
            if (acpxEvent.data.stream === "output") {
              const last = session.messages[session.messages.length - 1];
              if (last && last.role === "assistant") {
                last.content += acpxEvent.data.text;
              } else {
                state._nextMessageId += 1;
                session.messages.push({
                  id: String(state._nextMessageId),
                  role: "assistant",
                  content: acpxEvent.data.text,
                });
              }
            }
            if (acpxEvent.data.stream === "thought") {
              const last = session.messages[session.messages.length - 1];
              if (last && last.role === "assistant") {
                last.thinking = (last.thinking ?? "") + acpxEvent.data.text;
              } else {
                state._nextMessageId += 1;
                session.messages.push({
                  id: String(state._nextMessageId),
                  role: "assistant",
                  content: "",
                  thinking: acpxEvent.data.text,
                });
              }
            }
            break;
          }
          case "tool_call": {
            session.toolCalls.set(acpxEvent.data.tool_call_id, {
              toolCallId: acpxEvent.data.tool_call_id,
              title: acpxEvent.data.title ?? "",
              kind: undefined,
              status: acpxEvent.data.status,
            });
            break;
          }
        }
      });
    },
  })),
);
