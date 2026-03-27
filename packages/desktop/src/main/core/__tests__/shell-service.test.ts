import { beforeEach, describe, expect, it } from "vitest";

import { shellEnvService } from "../shell-service";

describe("ShellEnvironmentService", () => {
  beforeEach(() => {
    shellEnvService._resetForTesting();
  });

  it("getEnv() returns a record with PATH", async () => {
    const env = await shellEnvService.getEnv();
    expect(env).toBeDefined();
    expect(typeof env.PATH).toBe("string");
    expect(env.PATH.length).toBeGreaterThan(0);
  });

  it("getEnv() caches the result", async () => {
    const first = shellEnvService.getEnv();
    const second = shellEnvService.getEnv();
    expect(first).toBe(second);
  });

  it("getEnv() returns env with SHELL key", async () => {
    const env = await shellEnvService.getEnv();
    expect(typeof env.SHELL).toBe("string");
  });

  it("_resetForTesting() clears cache", async () => {
    const first = shellEnvService.getEnv();
    shellEnvService._resetForTesting();
    const second = shellEnvService.getEnv();
    expect(first).not.toBe(second);
  });
});
