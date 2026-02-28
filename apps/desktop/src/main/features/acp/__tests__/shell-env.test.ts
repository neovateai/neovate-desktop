import { describe, it, expect, afterEach } from "vitest";
import { getShellEnvironment, clearShellEnvironmentCache } from "../shell-env";

afterEach(() => {
  clearShellEnvironmentCache();
});

describe("getShellEnvironment", () => {
  it("returns an object with PATH", async () => {
    const env = await getShellEnvironment();
    expect(typeof env).toBe("object");
    // PATH should almost always be present on a dev machine
    expect(env.PATH).toBeDefined();
    expect(env.PATH!.length).toBeGreaterThan(0);
  }, 10000);

  it("caches the result across calls", async () => {
    const first = await getShellEnvironment();
    const second = await getShellEnvironment();
    expect(first).toBe(second); // same reference
  }, 10000);

  it("clearShellEnvironmentCache resets the cache", async () => {
    const first = await getShellEnvironment();
    clearShellEnvironmentCache();
    const second = await getShellEnvironment();
    // Different object references after cache clear
    expect(first).not.toBe(second);
    // Same keys present in both
    expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort());
  }, 10000);

  it("only includes relevant env vars", async () => {
    const env = await getShellEnvironment();
    const allowedKeys = new Set([
      "PATH",
      "NVM_DIR",
      "NVM_BIN",
      "VOLTA_HOME",
      "FNM_DIR",
      "FNM_MULTISHELL_PATH",
      "BUN_INSTALL",
      "PNPM_HOME",
      "N_PREFIX",
    ]);
    for (const key of Object.keys(env)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  }, 10000);
});
