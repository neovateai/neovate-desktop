import { describe, it, expect, vi, beforeEach } from "vitest";
import { AcpConnectionManager } from "../connection-manager";

// Flag to control mock behavior
let nextStartError: Error | null = null;

// Mock acpx — AcpClient must be a proper class so `new AcpClient()` works.
vi.mock("acpx", () => {
  class MockAcpClient {
    _opts: any;
    start = vi.fn().mockImplementation(() => {
      if (nextStartError) {
        const err = nextStartError;
        nextStartError = null;
        return Promise.reject(err);
      }
      return Promise.resolve();
    });
    close = vi.fn().mockResolvedValue(undefined);
    constructor(opts: any) {
      this._opts = opts;
    }
  }
  return {
    AcpClient: MockAcpClient,
    resolveAgentCommand: vi.fn((name: string) => `mock-${name}`),
  };
});

// Mock shell-env
vi.mock("../shell-env", () => ({
  getShellEnvironment: vi.fn().mockResolvedValue({ PATH: "/mock/bin" }),
}));

describe("AcpConnectionManager", () => {
  let manager: AcpConnectionManager;

  beforeEach(() => {
    manager = new AcpConnectionManager();
  });

  it("connect() creates and stores a connection", async () => {
    const conn = await manager.connect("test-agent");

    expect(conn.id).toBe("acp-1");
    expect(manager.get("acp-1")).toBe(conn);
  });

  it("connect() assigns incrementing IDs per instance", async () => {
    const conn1 = await manager.connect("agent-a");
    const conn2 = await manager.connect("agent-b");

    expect(conn1.id).toBe("acp-1");
    expect(conn2.id).toBe("acp-2");
  });

  it("separate manager instances have independent ID counters", async () => {
    const manager2 = new AcpConnectionManager();
    const conn1 = await manager.connect("agent-a");
    const conn2 = await manager2.connect("agent-b");

    expect(conn1.id).toBe("acp-1");
    expect(conn2.id).toBe("acp-1");
  });

  it("get() returns undefined for unknown ID", () => {
    expect(manager.get("nonexistent")).toBeUndefined();
  });

  it("getClient() returns undefined for unknown ID", () => {
    expect(manager.getClient("nonexistent")).toBeUndefined();
  });

  it("getStderr() returns empty array for unknown ID", () => {
    expect(manager.getStderr("nonexistent")).toEqual([]);
  });

  it("disconnect() removes the connection and closes client", async () => {
    const conn = await manager.connect("test-agent");
    const client = manager.getClient(conn.id);

    await manager.disconnect(conn.id);

    expect(manager.get(conn.id)).toBeUndefined();
    expect(client!.close).toHaveBeenCalled();
  });

  it("disconnect() is a no-op for unknown ID", async () => {
    await expect(manager.disconnect("nonexistent")).resolves.toBeUndefined();
  });

  it("disconnectAll() cleans up all connections", async () => {
    const conn1 = await manager.connect("agent-a");
    const conn2 = await manager.connect("agent-b");
    const client1 = manager.getClient(conn1.id);
    const client2 = manager.getClient(conn2.id);

    await manager.disconnectAll();

    expect(manager.get(conn1.id)).toBeUndefined();
    expect(manager.get(conn2.id)).toBeUndefined();
    expect(client1!.close).toHaveBeenCalled();
    expect(client2!.close).toHaveBeenCalled();
  });

  it("connect() propagates errors from client.start()", async () => {
    nextStartError = new Error("spawn failed");
    await expect(manager.connect("bad-agent")).rejects.toThrow("spawn failed");
  });
});
