import { describe, it, expect, vi, beforeEach } from "vitest";
import { call, os } from "@orpc/server";
import type { PluginContext } from "../../../core/plugin/types";

vi.mock("electron", () => ({
  app: { getVersion: vi.fn().mockReturnValue("1.0.0-test") },
}));

function makeCtx(): PluginContext {
  return {
    app: {
      subscriptions: { push: vi.fn() },
      windowManager: {
        mainWindow: null,
        createMainWindow: vi.fn(),
        open: vi.fn(),
        close: vi.fn(),
        destroyAll: vi.fn(),
      },
    },
    orpcServer: os,
  };
}

describe("system-info plugin", () => {
  beforeEach(() => { vi.resetModules(); });

  async function loadPlugin() {
    const mod = await import("../index");
    return mod.default;
  }

  it("has name 'systemInfo'", async () => {
    const plugin = await loadPlugin();
    expect(plugin.name).toBe("systemInfo");
  });

  it("configContributions returns a router", async () => {
    const plugin = await loadPlugin();
    const contributions = await plugin.configContributions!(makeCtx());
    expect(contributions.router).toBeDefined();
  });

  it("getInfo returns system info", async () => {
    const plugin = await loadPlugin();
    const contributions = await plugin.configContributions!(makeCtx());
    const result = await call(contributions.router!.getInfo, undefined);

    expect(result).toMatchObject({
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      appVersion: "1.0.0-test",
    });
    expect(typeof result.electronVersion).toBe("string");
  });
});
