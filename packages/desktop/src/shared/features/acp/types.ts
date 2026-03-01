import type { AcpxEvent } from "acpx";
import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";

export type AgentInfo = {
  id: string;
  name: string;
};

/** What the eventIterator yields to the renderer */
export type StreamEvent =
  | { type: "acpx_event"; event: AcpxEvent }
  | { type: "user_message"; text: string }
  | {
      type: "permission_request";
      requestId: string;
      data: RequestPermissionRequest;
    };

/** Lightweight session metadata for the sidebar list */
export type SessionInfo = {
  sessionId: string;
  title?: string;
  cwd: string;
  updatedAt: string;
};

/** Final return value when loadSession replay completes */
export type LoadSessionResult = {
  sessionId: string;
  agentSessionId?: string;
};

/** Final return value when prompt completes */
export type PromptResult = {
  stopReason: string;
};
