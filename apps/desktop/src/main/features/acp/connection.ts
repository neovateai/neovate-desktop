import type {
  ClientSideConnection,
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import { EventPublisher } from "@orpc/server";
import type { SessionEvent } from "../../../shared/features/acp/types";

type PendingPermission = {
  resolve: (response: RequestPermissionResponse) => void;
};

export type SdkRef = { value: ClientSideConnection | null };

export class AcpConnection {
  readonly id: string;
  private sdkRef: SdkRef;
  private publisher = new EventPublisher<{ session: SessionEvent }>();
  private pendingPermissions = new Map<string, PendingPermission>();
  private requestIdCounter = 0;

  constructor(id: string, sdkRef: SdkRef) {
    this.id = id;
    this.sdkRef = sdkRef;
  }

  get sdk(): ClientSideConnection {
    if (!this.sdkRef.value) throw new Error("SDK not initialized");
    return this.sdkRef.value;
  }

  /** Emit a session update event to all subscribers */
  emitSessionUpdate(notification: SessionNotification): void {
    this.publisher.publish("session", {
      type: "update",
      data: notification,
    });
  }

  /**
   * Handle a permission request from the agent.
   * Publishes an event to subscribers and returns a promise that resolves
   * when the user responds via resolvePermission().
   */
  handlePermissionRequest(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const requestId = String(++this.requestIdCounter);

    return new Promise<RequestPermissionResponse>((resolve) => {
      this.pendingPermissions.set(requestId, { resolve });

      this.publisher.publish("session", {
        type: "permission_request",
        requestId,
        data: params,
      });
    });
  }

  /** Resolve a pending permission request (called from renderer via oRPC) */
  resolvePermission(requestId: string, optionId: string): void {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) return;

    this.pendingPermissions.delete(requestId);
    pending.resolve({
      outcome: { outcome: "selected", optionId },
    });
  }

  /** Subscribe to session events as an async iterable */
  subscribeSession(signal?: AbortSignal): AsyncGenerator<SessionEvent> {
    return this.publisher.subscribe("session", { signal });
  }

  /** Clean up resources */
  dispose(): void {
    // Reject all pending permissions
    for (const [id, pending] of this.pendingPermissions) {
      pending.resolve({ outcome: { outcome: "cancelled" } });
      this.pendingPermissions.delete(id);
    }
  }
}
