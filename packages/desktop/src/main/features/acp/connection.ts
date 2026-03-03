import type { AcpClient } from "acpx";
import { sessionUpdateToEventDrafts, createAcpxEvent } from "acpx";
import type {
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import { EventPublisher } from "@orpc/server";
import type { StreamEvent } from "../../../shared/features/acp/types";

/** Auto-cancel permission requests after 5 minutes of no UI response. */
export const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

function eventBelongsToSession(event: StreamEvent, sessionId: string): boolean {
  switch (event.type) {
    case "acpx_event":
      return event.event.session_id === sessionId;
    case "user_message":
      return event.sessionId === sessionId;
    case "permission_request":
      return event.data.sessionId === sessionId;
    case "timing":
      return true;
  }
}

async function* filterStreamBySession(
  source: AsyncGenerator<StreamEvent>,
  sessionId: string,
): AsyncGenerator<StreamEvent> {
  try {
    for await (const event of source) {
      if (eventBelongsToSession(event, sessionId)) {
        yield event;
      }
    }
  } finally {
    source.return(undefined);
  }
}

type PendingPermission = {
  resolve: (response: RequestPermissionResponse) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class AcpConnection {
  readonly id: string;
  private _client?: AcpClient;
  private publisher = new EventPublisher<{ session: StreamEvent }>();
  private pendingPermissions = new Map<string, PendingPermission>();
  private requestIdCounter = 0;
  private seq = 0;

  constructor(id: string) {
    this.id = id;
  }

  get client(): AcpClient {
    if (!this._client) throw new Error("Client not initialized");
    return this._client;
  }

  setClient(client: AcpClient): void {
    this._client = client;
  }

  emitSessionUpdate(notification: SessionNotification): void {
    const update = notification.update;
    const sid = notification.sessionId;

    if (update.sessionUpdate === "user_message_chunk" && update.content.type === "text") {
      this.publisher.publish("session", {
        type: "user_message",
        sessionId: sid,
        text: update.content.text,
      });
      return;
    }

    const drafts = sessionUpdateToEventDrafts(notification);
    for (const draft of drafts) {
      const event = createAcpxEvent({ sessionId: sid, seq: this.seq++ }, draft);
      this.publisher.publish("session", { type: "acpx_event", event });
    }
  }

  handlePermissionRequest(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const requestId = String(++this.requestIdCounter);
    return new Promise<RequestPermissionResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPermissions.delete(requestId);
        resolve({ outcome: { outcome: "cancelled" } });
      }, PERMISSION_TIMEOUT_MS);

      this.pendingPermissions.set(requestId, { resolve, timer });
      this.publisher.publish("session", {
        type: "permission_request",
        requestId,
        data: params,
      });
    });
  }

  resolvePermission(requestId: string, optionId: string): void {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingPermissions.delete(requestId);
    pending.resolve({ outcome: { outcome: "selected", optionId } });
  }

  subscribeSession(sessionId: string, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
    const raw = this.publisher.subscribe("session", { signal });
    return filterStreamBySession(raw, sessionId);
  }

  dispose(): void {
    for (const [id, pending] of this.pendingPermissions) {
      clearTimeout(pending.timer);
      pending.resolve({ outcome: { outcome: "cancelled" } });
      this.pendingPermissions.delete(id);
    }
  }
}
