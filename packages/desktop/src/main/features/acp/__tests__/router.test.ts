import { call } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { describe, it, expect, vi } from "vitest";
import { acpRouter } from "../router";
import type { AppContext } from "../../../router";
import { AcpConnection } from "../connection";

function makeContext(overrides?: Partial<AppContext["acpConnectionManager"]>): AppContext {
  return {
    projectStore: {} as any,
    acpConnectionManager: {
      connect: vi.fn(),
      get: vi.fn(),
      getOrThrow: vi.fn().mockImplementation((id: string) => {
        throw new ORPCError("NOT_FOUND", { defined: true, message: `Unknown connection: ${id}` });
      }),
      getClient: vi.fn(),
      getAgentCommand: vi.fn().mockReturnValue(""),
      getCwd: vi.fn().mockReturnValue(process.cwd()),
      getSessionRecord: vi.fn(),
      setSessionRecord: vi.fn(),
      getStderr: vi.fn().mockReturnValue([]),
      disconnect: vi.fn(),
      disconnectAll: vi.fn(),
      ...overrides,
    } as any,
  };
}

describe("acpRouter", () => {
  describe("listAgents", () => {
    it("returns built-in agents", async () => {
      const context = makeContext();
      const agents = await call(acpRouter.listAgents, undefined, { context });

      expect(agents).toBeInstanceOf(Array);
      expect(agents.length).toBeGreaterThan(0);
      for (const agent of agents) {
        expect(agent).toHaveProperty("id");
        expect(agent).toHaveProperty("name");
      }
    });
  });

  describe("connect", () => {
    it("returns connectionId on success", async () => {
      const fakeConn = new AcpConnection("acp-42");
      const context = makeContext({
        connect: vi.fn().mockResolvedValue(fakeConn),
      });

      const result = await call(acpRouter.connect, { agentId: "test-agent" }, { context });

      expect(result).toEqual({ connectionId: "acp-42" });
    });

    it("throws BAD_GATEWAY on AgentSpawnError", async () => {
      const context = makeContext({
        connect: vi.fn().mockRejectedValue(new Error("ENOENT")),
      });

      await expect(call(acpRouter.connect, { agentId: "bad-agent" }, { context })).rejects.toThrow(
        ORPCError,
      );
    });
  });

  describe("newSession", () => {
    it("creates session on valid connection", async () => {
      const fakeConn = new AcpConnection("acp-1");
      fakeConn.setClient({
        createSession: vi.fn().mockResolvedValue({ sessionId: "s-123" }),
      } as any);

      const context = makeContext({
        getOrThrow: vi.fn().mockReturnValue(fakeConn),
      });

      const result = await call(acpRouter.newSession, { connectionId: "acp-1" }, { context });

      expect(result).toEqual({ sessionId: "s-123" });
    });

    it("throws NOT_FOUND for unknown connection", async () => {
      const context = makeContext();

      await expect(
        call(acpRouter.newSession, { connectionId: "unknown" }, { context }),
      ).rejects.toThrow(ORPCError);
    });
  });

  describe("resolvePermission", () => {
    it("calls resolvePermission on connection", async () => {
      const fakeConn = new AcpConnection("acp-1");
      vi.spyOn(fakeConn, "resolvePermission");

      const context = makeContext({
        getOrThrow: vi.fn().mockReturnValue(fakeConn),
      });

      await call(
        acpRouter.resolvePermission,
        { connectionId: "acp-1", requestId: "r1", optionId: "allow" },
        { context },
      );

      expect(fakeConn.resolvePermission).toHaveBeenCalledWith("r1", "allow");
    });

    it("throws NOT_FOUND for unknown connection", async () => {
      const context = makeContext();

      await expect(
        call(
          acpRouter.resolvePermission,
          { connectionId: "unknown", requestId: "r1", optionId: "allow" },
          { context },
        ),
      ).rejects.toThrow(ORPCError);
    });
  });

  describe("cancel", () => {
    it("cancels session on valid connection", async () => {
      const fakeConn = new AcpConnection("acp-1");
      fakeConn.setClient({
        cancel: vi.fn().mockResolvedValue(undefined),
      } as any);

      const context = makeContext({
        getOrThrow: vi.fn().mockReturnValue(fakeConn),
      });

      await call(acpRouter.cancel, { connectionId: "acp-1", sessionId: "s1" }, { context });

      expect(fakeConn.client.cancel).toHaveBeenCalledWith("s1");
    });

    it("throws NOT_FOUND for unknown connection", async () => {
      const context = makeContext();

      await expect(
        call(acpRouter.cancel, { connectionId: "unknown", sessionId: "s1" }, { context }),
      ).rejects.toThrow(ORPCError);
    });
  });

  describe("disconnect", () => {
    it("calls disconnect on manager", async () => {
      const context = makeContext({
        disconnect: vi.fn().mockResolvedValue(undefined),
      });

      await call(acpRouter.disconnect, { connectionId: "acp-1" }, { context });

      expect(context.acpConnectionManager.disconnect).toHaveBeenCalledWith("acp-1");
    });
  });
});
