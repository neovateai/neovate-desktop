import type { SessionNotification, RequestPermissionRequest } from "@agentclientprotocol/sdk";

export type AgentInfo = {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

/** What the eventIterator yields to the renderer */
export type SessionEvent =
  | { type: "update"; data: SessionNotification }
  | {
      type: "permission_request";
      requestId: string;
      data: RequestPermissionRequest;
    };

/** Final return value when prompt completes */
export type PromptResult = {
  stopReason: string;
};
