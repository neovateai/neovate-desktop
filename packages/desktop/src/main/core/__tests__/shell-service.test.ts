import { beforeEach, describe, expect, it } from "vitest";

import { ShellEnvironmentService } from "../shell-service";

describe("ShellEnvironmentService", () => {
  let service: ShellEnvironmentService;

  beforeEach(() => {
    service = new ShellEnvironmentService();
  });

  it("getEnv() returns a record with PATH", async () => {
    const env = await service.getEnv();
    expect(env).toBeDefined();
    expect(typeof env.PATH).toBe("string");
    expect(env.PATH.length).toBeGreaterThan(0);
  });

  it("getEnv() caches the result", async () => {
    const first = service.getEnv();
    const second = service.getEnv();
    expect(first).toBe(second);
  });

  it("getEnv() returns env with SHELL key", async () => {
    const env = await service.getEnv();
    expect(typeof env.SHELL).toBe("string");
  });

  it("_resetForTesting() clears cache", async () => {
    const first = service.getEnv();
    service._resetForTesting();
    const second = service.getEnv();
    expect(first).not.toBe(second);
  });
});
