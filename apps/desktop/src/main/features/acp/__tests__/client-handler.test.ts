import { describe, it, expect, vi } from "vitest";
import type { ClientSideConnection } from "@agentclientprotocol/sdk";
import { AcpConnection, type SdkRef } from "../connection";
import { ClientHandler } from "../client-handler";

function setup() {
  const sdkRef: SdkRef = { value: {} as ClientSideConnection };
  const connection = new AcpConnection("test", sdkRef);
  const handler = new ClientHandler(connection);
  return { connection, handler };
}

describe("ClientHandler", () => {
  it("sessionUpdate delegates to connection.emitSessionUpdate", async () => {
    const { connection, handler } = setup();
    const spy = vi.spyOn(connection, "emitSessionUpdate");

    const notification = {
      sessionId: "s1",
      update: {
        sessionUpdate: "agent_message_chunk" as const,
        content: { type: "text" as const, text: "hi" },
      },
    };

    await handler.sessionUpdate(notification);
    expect(spy).toHaveBeenCalledWith(notification);
  });

  it("requestPermission delegates to connection.handlePermissionRequest", async () => {
    const { connection, handler } = setup();

    const params = {
      sessionId: "s1",
      toolCall: {
        toolCallId: "tc1",
        title: "Test",
        kind: "edit" as const,
        status: "pending" as const,
      },
      options: [{ kind: "allow_once" as const, name: "Allow", optionId: "allow" }],
    };

    const spy = vi.spyOn(connection, "handlePermissionRequest").mockResolvedValue({
      outcome: { outcome: "selected", optionId: "allow" },
    });

    const result = await handler.requestPermission(params);
    expect(spy).toHaveBeenCalledWith(params);
    expect(result).toEqual({
      outcome: { outcome: "selected", optionId: "allow" },
    });
  });
});
