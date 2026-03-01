import { create } from "zustand";
import type { AgentInfo, StreamEvent } from "../../../../shared/features/acp/types";
import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";

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
  appendChunk: (sessionId: string, event: StreamEvent) => void;
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

    // event.type === "acpx_event"
    const acpxEvent = event.event;
    const messages = [...session.messages];
    const toolCalls = new Map(session.toolCalls);

    switch (acpxEvent.type) {
      case "output_delta": {
        if (acpxEvent.data.stream === "output") {
          const last = messages[messages.length - 1];
          if (last && last.role === "assistant") {
            messages[messages.length - 1] = {
              ...last,
              content: last.content + acpxEvent.data.text,
            };
          } else {
            messages.push({
              id: String(++messageId),
              role: "assistant",
              content: acpxEvent.data.text,
            });
          }
        }
        if (acpxEvent.data.stream === "thought") {
          const last = messages[messages.length - 1];
          if (last && last.role === "assistant") {
            messages[messages.length - 1] = {
              ...last,
              thinking: (last.thinking ?? "") + acpxEvent.data.text,
            };
          } else {
            messages.push({
              id: String(++messageId),
              role: "assistant",
              content: "",
              thinking: acpxEvent.data.text,
            });
          }
        }
        break;
      }
      case "tool_call": {
        toolCalls.set(acpxEvent.data.tool_call_id, {
          toolCallId: acpxEvent.data.tool_call_id,
          title: acpxEvent.data.title ?? "",
          kind: undefined,
          status: acpxEvent.data.status,
        });
        break;
      }
    }

    sessions.set(sessionId, { ...session, messages, toolCalls });
    set({ sessions });
  },
}));
