import { describe, it, expect } from "vitest";
import { AcpConnectionManager } from "../connection-manager";
import { join } from "node:path";

const MOCK_AGENT_PATH = join(__dirname, "../../../../..", "test/fixtures/mock-agent.ts");

const mockAgentInfo = {
  id: "mock",
  name: "Mock Agent",
  command: "bun",
  args: [MOCK_AGENT_PATH],
};

describe("AcpConnectionManager", () => {
  it("connect creates a connection and returns it", async () => {
    const manager = new AcpConnectionManager();
    const conn = await manager.connect(mockAgentInfo);

    expect(conn.id).toMatch(/^acp-/);
    expect(manager.get(conn.id)).toBe(conn);

    manager.disconnectAll();
  }, 15000);

  it("disconnect removes connection from map", async () => {
    const manager = new AcpConnectionManager();
    const conn = await manager.connect(mockAgentInfo);
    const id = conn.id;

    manager.disconnect(id);
    expect(manager.get(id)).toBeUndefined();
  }, 15000);

  it("disconnectAll cleans up everything", async () => {
    const manager = new AcpConnectionManager();
    const conn1 = await manager.connect(mockAgentInfo);
    const conn2 = await manager.connect(mockAgentInfo);

    manager.disconnectAll();
    expect(manager.get(conn1.id)).toBeUndefined();
    expect(manager.get(conn2.id)).toBeUndefined();
  }, 15000);

  it("get returns undefined for unknown id", () => {
    const manager = new AcpConnectionManager();
    expect(manager.get("nonexistent")).toBeUndefined();
  });

  it("disconnect is no-op for unknown id", () => {
    const manager = new AcpConnectionManager();
    // Should not throw
    manager.disconnect("nonexistent");
  });
});
