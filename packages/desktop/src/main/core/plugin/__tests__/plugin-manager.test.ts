import { describe, it, expect, vi } from "vitest";

import type { MainPlugin, PluginContext } from "../types";

import { PluginManager } from "../plugin-manager";

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
        ensureMinWidth: vi.fn(),
        prepareForQuit: vi.fn(),
      },
      deeplink: {
        register: vi.fn(),
        handle: vi.fn(),
        activate: vi.fn(),
        consumePending: vi.fn(),
        dispose: vi.fn(),
        publisher: { size: 0, publish: vi.fn(), subscribe: vi.fn() },
      } as any,
      analytics: { track: vi.fn() } as any,
    },
    orpcServer: { router: vi.fn(), handler: vi.fn() } as any,
    shell: { getEnv: vi.fn() } as any,
    llm: {
      isAvailable: () => Promise.resolve(false),
      query: vi.fn(),
      queryMessages: vi.fn(),
    },
  };
}

describe("PluginManager", () => {
  describe("duplicate name guard", () => {
    it("throws on duplicate plugin names", () => {
      expect(() => new PluginManager([{ name: "a" }, { name: "a" }])).toThrow(
        'Duplicate plugin name: "a"',
      );
    });
  });

  describe("enforce ordering", () => {
    it("sorts plugins: pre → normal → post", () => {
      const pre: MainPlugin = { name: "pre", enforce: "pre" };
      const normal: MainPlugin = { name: "normal" };
      const post: MainPlugin = { name: "post", enforce: "post" };

      const manager = new PluginManager([post, normal, pre]);
      const names = manager.getPlugins().map((p) => p.name);

      expect(names).toEqual(["pre", "normal", "post"]);
    });
  });

  describe("configContributions", () => {
    it("collects router keyed by plugin name", async () => {
      const fakeRouter = { handler: "fake" } as any;
      const plugin: MainPlugin = {
        name: "test",
        configContributions: () => ({ router: fakeRouter }),
      };

      const manager = new PluginManager([plugin]);
      await manager.configContributions(makeCtx());

      expect(manager.contributions.routers.find((c) => c.plugin.name === "test")?.value).toBe(
        fakeRouter,
      );
    });

    it("skips plugins without configContributions", async () => {
      const plugin: MainPlugin = { name: "empty" };
      const manager = new PluginManager([plugin]);
      await manager.configContributions(makeCtx());

      expect(manager.contributions.routers.length).toBe(0);
    });

    it("skips plugins that return no router", async () => {
      const plugin: MainPlugin = { name: "no-router", configContributions: () => ({}) };
      const manager = new PluginManager([plugin]);
      await manager.configContributions(makeCtx());

      expect(manager.contributions.routers.length).toBe(0);
    });

    it("passes PluginContext to configContributions", async () => {
      const spy = vi.fn().mockReturnValue({});
      const plugin: MainPlugin = { name: "test", configContributions: spy };
      const ctx = makeCtx();

      const manager = new PluginManager([plugin]);
      await manager.configContributions(ctx);

      expect(spy).toHaveBeenCalledWith(ctx);
    });

    it("runs configContributions in parallel", async () => {
      const order: string[] = [];
      const slow: MainPlugin = {
        name: "slow",
        configContributions: () =>
          new Promise((r) =>
            setTimeout(() => {
              order.push("slow");
              r({});
            }, 10),
          ),
      };
      const fast: MainPlugin = {
        name: "fast",
        configContributions: () => {
          order.push("fast");
          return {};
        },
      };

      const manager = new PluginManager([slow, fast]);
      await manager.configContributions(makeCtx());

      expect(order).toEqual(["fast", "slow"]);
    });
  });

  describe("activate", () => {
    it("calls activate in enforce order", async () => {
      const order: string[] = [];
      const mkPlugin = (name: string, enforce?: "pre" | "post"): MainPlugin => ({
        name,
        enforce,
        activate: () => {
          order.push(name);
        },
      });

      const manager = new PluginManager([
        mkPlugin("post", "post"),
        mkPlugin("normal"),
        mkPlugin("pre", "pre"),
      ]);
      await manager.activate(makeCtx());

      expect(order).toEqual(["pre", "normal", "post"]);
    });

    it("passes PluginContext to activate", async () => {
      const spy = vi.fn();
      const plugin: MainPlugin = { name: "test", activate: spy };
      const ctx = makeCtx();

      const manager = new PluginManager([plugin]);
      await manager.activate(ctx);

      expect(spy).toHaveBeenCalledWith(ctx);
    });
  });

  describe("deactivate", () => {
    it("calls deactivate on all plugins", async () => {
      const spy = vi.fn();
      const plugin: MainPlugin = { name: "test", deactivate: spy };

      const manager = new PluginManager([plugin]);
      await manager.deactivate();

      expect(spy).toHaveBeenCalled();
    });

    it("skips plugins without deactivate", async () => {
      const plugin: MainPlugin = { name: "empty" };
      const manager = new PluginManager([plugin]);
      await expect(manager.deactivate()).resolves.toBeUndefined();
    });
  });
});
