import type {
  Client,
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type { AcpConnection } from "./connection";

/**
 * Implements the ACP Client interface — the callbacks the agent invokes.
 * Delegates to the AcpConnection which owns the EventPublisher.
 */
export class ClientHandler implements Client {
  constructor(private connection: AcpConnection) {}

  async sessionUpdate(params: SessionNotification): Promise<void> {
    this.connection.emitSessionUpdate(params);
  }

  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    return this.connection.handlePermissionRequest(params);
  }
}
