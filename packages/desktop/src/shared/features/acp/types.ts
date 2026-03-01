import type { AcpxEvent } from "acpx";
import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";

export type AgentInfo = {
  id: string;
  name: string;
};

/** What the eventIterator yields to the renderer */
export type StreamEvent =
  | { type: "acpx_event"; event: AcpxEvent }
  | {
      type: "permission_request";
      requestId: string;
      data: RequestPermissionRequest;
    };

/** Final return value when prompt completes */
export type PromptResult = {
  stopReason: string;
};
