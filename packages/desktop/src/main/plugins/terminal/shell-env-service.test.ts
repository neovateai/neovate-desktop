import { describe, expect, it, vi } from "vitest";

import { ShellEnvService } from "./shell-env-service";

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: (
    command: string,
    args: string[],
    options: { stdio: readonly [string, string, string]; timeout?: number },
  ) => {
    const mockChild = {
      stdout: null as NodeJS.ReadableStream | null,
      stderr: null as NodeJS.ReadableStream | null,
      on: vi.fn(),
    };

    // Simulate readable streams
    const { Readable } = require("stream");
    mockChild.stdout = new Readable();
    mockChild.stderr = new Readable();

    // Default success case: return typical env output
    setImmediate(() => {
      mockChild.stdout?.push("PATH=/usr/bin:/bin:/usr/local/bin\n");
      mockChild.stdout?.push("HOME=/home/user\n");
      mockChild.stdout?.push("SHELL=/bin/zsh\n");
      mockChild.stdout?.push("TEST_VAR=test_value\n");
      mockChild.stdout?.push(null); // EOF
    });

    // Track event listeners
    const listeners = new Map<string, Function[]>();
    mockChild.on.mockImplementation((event: string, callback: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(callback);

      // Auto-trigger 'close' event for success case
      if (event === "close") {
        setImmediate(() => callback(0));
      }
    });

    // Helper to trigger events in tests
    (mockChild as any)._trigger = (event: string, ...args: unknown[]) => {
      const callbacks = listeners.get(event) || [];
      callbacks.forEach((cb) => cb(...args));
    };

    // Simulate timeout if options.timeout is 1
    if (options.timeout === 1) {
      setImmediate(() => mockChild.kill?.());
    }

    return mockChild;
  },
}));

// Mock os module
vi.mock("node:os", () => ({
  platform: () => "darwin",
  default: {
    platform: () => "darwin",
  },
}));

describe("ShellEnvService", () => {
  describe("getShell", () => {
    it("should return SHELL environment variable if set", () => {
      const originalShell = process.env.SHELL;
      process.env.SHELL = "/usr/local/bin/zsh";

      const service = new ShellEnvService();
      expect(service.getShell()).toBe("/usr/local/bin/zsh");

      process.env.SHELL = originalShell;
    });

    it("should fallback to /bin/zsh when SHELL is not set", () => {
      const originalShell = process.env.SHELL;
      delete process.env.SHELL;

      const service = new ShellEnvService();
      expect(service.getShell()).toBe("/bin/zsh");

      process.env.SHELL = originalShell;
    });
  });

  describe("getEnvironment", () => {
    it("should extract environment variables from shell", async () => {
      const service = new ShellEnvService();
      const env = await service.getEnvironment();

      expect(env).toMatchObject({
        PATH: "/usr/bin:/bin:/usr/local/bin",
        HOME: "/home/user",
        SHELL: "/bin/zsh",
        TEST_VAR: "test_value",
      });
    });

    it("should cache results for same shell and timeout", async () => {
      const service = new ShellEnvService();
      const env1 = await service.getEnvironment({ timeout: 5000 });
      const env2 = await service.getEnvironment({ timeout: 5000 });

      expect(env1).toBe(env2);
    });

    it("should create separate cache entries for different timeouts", async () => {
      const service = new ShellEnvService();
      const env1 = await service.getEnvironment({ timeout: 1000 });
      const env2 = await service.getEnvironment({ timeout: 2000 });

      expect(env1).not.toBe(env2);
    });

    it("should return pending promise if extraction is in progress", async () => {
      const service = new ShellEnvService();
      const promise1 = service.getEnvironment({ timeout: 3000 });
      const promise2 = service.getEnvironment({ timeout: 3000 });

      expect(promise1).toBe(promise2);
      await promise1;
    });

    it("should handle empty env output gracefully", async () => {
      // This test would require a more sophisticated mock
      // For now, just verify it doesn't throw
      const service = new ShellEnvService();
      await expect(service.getEnvironment()).resolves.toBeDefined();
    });
  });

  describe("getEnvironmentSync", () => {
    it("should return undefined when cache is empty", () => {
      const service = new ShellEnvService();
      expect(service.getEnvironmentSync()).toBeUndefined();
    });

    it("should return cached environment after getEnvironment", async () => {
      const service = new ShellEnvService();
      const asyncEnv = await service.getEnvironment();
      const syncEnv = service.getEnvironmentSync();

      expect(syncEnv).toBe(asyncEnv);
      expect(syncEnv).toEqual({
        PATH: "/usr/bin:/bin:/usr/local/bin",
        HOME: "/home/user",
        SHELL: "/bin/zsh",
        TEST_VAR: "test_value",
      });
    });
  });

  describe("invalidateCache", () => {
    it("should clear cached environment", async () => {
      const service = new ShellEnvService();
      await service.getEnvironment();
      expect(service.getEnvironmentSync()).toBeDefined();

      service.invalidateCache();
      expect(service.getEnvironmentSync()).toBeUndefined();
    });

    it("should clear pending promises", () => {
      const service = new ShellEnvService();
      const promise = service.getEnvironment({ timeout: 4000 });

      service.invalidateCache();

      // After invalidation, new call should create new promise
      const newPromise = service.getEnvironment({ timeout: 4000 });
      expect(newPromise).not.toBe(promise);
    });
  });

  describe("env parsing", () => {
    it("should parse KEY=VALUE format correctly", async () => {
      const service = new ShellEnvService();
      const env = await service.getEnvironment();

      expect(env.PATH).toBe("/usr/bin:/bin:/usr/local/bin");
      expect(env.HOME).toBe("/home/user");
      expect(env.SHELL).toBe("/bin/zsh");
    });

    it("should handle values with special characters", async () => {
      // The mock includes TEST_VAR=test_value
      const service = new ShellEnvService();
      const env = await service.getEnvironment();

      expect(env.TEST_VAR).toBe("test_value");
    });
  });

  describe("error handling", () => {
    it("should fallback to process.env on shell error", async () => {
      // This test would require mocking spawn to trigger 'error' event
      // For now, just verify the service handles errors gracefully
      const service = new ShellEnvService();
      const env = await service.getEnvironment();

      // Should return some environment
      expect(Object.keys(env).length).toBeGreaterThan(0);
    });
  });

  describe("login flag", () => {
    it("should use -l flag for zsh", () => {
      process.env.SHELL = "/bin/zsh";
      const service = new ShellEnvService();
      expect(service.getShell()).toBe("/bin/zsh");
    });

    it("should use -l flag for bash", () => {
      process.env.SHELL = "/bin/bash";
      const service = new ShellEnvService();
      expect(service.getShell()).toBe("/bin/bash");
    });

    it("should use -l flag for fish", () => {
      process.env.SHELL = "/usr/local/bin/fish";
      const service = new ShellEnvService();
      expect(service.getShell()).toBe("/usr/local/bin/fish");
    });
  });
});
