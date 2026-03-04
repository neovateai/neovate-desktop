import type { AcpxEvent } from "acpx";
import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";

export type AgentInfo = {
  id: string;
  name: string;
};

export type TimingEntry = {
  phase: string;
  label: string;
  durationMs: number;
  timestamp: number;
};

/** What the eventIterator yields to the renderer */
export type StreamEvent =
  | { type: "acpx_event"; event: AcpxEvent }
  | { type: "user_message"; sessionId: string; text: string }
  | {
      type: "permission_request";
      requestId: string;
      data: RequestPermissionRequest;
    }
  | { type: "timing"; entry: TimingEntry }
  | { type: "available_commands"; sessionId: string; commands: string[] };

/** Lightweight session metadata for the sidebar list */
export type SessionInfo = {
  sessionId: string;
  title?: string;
  cwd: string;
  updatedAt: string;
  createdAt: string;
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
