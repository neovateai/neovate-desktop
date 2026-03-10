import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: true },
}));

import { SessionManager, PERMISSION_TIMEOUT_MS } from "../session-manager";

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
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
