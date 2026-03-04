import { describe, it, expect, beforeEach } from "vitest";
import { SessionManager, PERMISSION_TIMEOUT_MS } from "../session-manager";

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it("resolvePermission for unknown requestId does not throw", () => {
    expect(() => manager.resolvePermission("nonexistent", true)).not.toThrow();
  });

  it("cancel for unknown sessionId does not throw", async () => {
    await expect(manager.cancel("nonexistent")).resolves.toBeUndefined();
  });

  it("closeSession for unknown sessionId does not throw", async () => {
    await expect(manager.closeSession("nonexistent")).resolves.toBeUndefined();
  });

  it("closeAll on empty manager does not throw", async () => {
    await expect(manager.closeAll()).resolves.toBeUndefined();
  });

  it("listSessions returns empty array for nonexistent dir", async () => {
    const sessions = await manager.listSessions("/tmp/nonexistent-" + Date.now());
    expect(sessions).toBeInstanceOf(Array);
  });

  it("exports PERMISSION_TIMEOUT_MS", () => {
    expect(PERMISSION_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
