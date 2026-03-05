import { describe, it, expect, vi } from "vitest";
import { PluginManager } from "../plugin/plugin-manager";
import type { IRendererApp } from "../types";
import type { RendererPlugin } from "../plugin";
import type { SecondarySidebarView, ContentPanelView } from "../plugin/contributions";

function createMockApp(): IRendererApp {
  return {
    subscriptions: { push: vi.fn() },
    i18nManager: {} as IRendererApp["i18nManager"],
    settings: {} as IRendererApp["settings"],
    workbench: { contentPanel: {} as any },
  };
}

function makeCtx() {
  return { app: createMockApp(), orpcClient: {} };
}

const mockComponent: SecondarySidebarView["component"] = () =>
  Promise.resolve({ default: () => null });

const mockContentComponent: ContentPanelView["component"] = () =>
  Promise.resolve({ default: () => null });

describe("PluginManager", () => {
  describe("enforce ordering", () => {
    it("sorts plugins: pre → normal → post", () => {
      const plugins: RendererPlugin[] = [
        { name: "normal" },
        { name: "post", enforce: "post" },
        { name: "pre", enforce: "pre" },
      ];
      const pm = new PluginManager(plugins);
      const names = pm.getPlugins().map((p) => p.name);
      expect(names).toEqual(["pre", "normal", "post"]);
    });
  });

  describe("configContributions", () => {
    it("merges contributions from all plugins", async () => {
      const plugins: RendererPlugin[] = [
        {
          name: "a",
          configContributions: () => ({
            secondarySidebarViews: [{ id: "a", title: "A", component: mockComponent }],
          }),
        },
        {
          name: "b",
          configContributions: () => ({
            secondarySidebarViews: [{ id: "b", title: "B", component: mockComponent }],
          }),
        },
      ];
      const pm = new PluginManager(plugins);
      await pm.configContributions();
      expect(pm.contributions.secondarySidebarViews).toHaveLength(2);
    });

    it("sorts activityBarItems by order", async () => {
      const MockIcon = () => null;
      const pm = new PluginManager([
        {
          name: "test",
          configContributions: () => ({
            activityBarItems: [
              {
                id: "z",
                icon: MockIcon,
                tooltip: "Z",
                action: { type: "secondarySidebarView", viewId: "z" },
                order: 30,
              },
              {
                id: "a",
                icon: MockIcon,
                tooltip: "A",
                action: { type: "secondarySidebarView", viewId: "a" },
                order: 10,
              },
            ],
          }),
        },
      ]);
      await pm.configContributions();
      expect(pm.contributions.activityBarItems[0].id).toBe("a");
      expect(pm.contributions.activityBarItems[1].id).toBe("z");
    });

    it("returns empty contributions when no plugins", async () => {
      const pm = new PluginManager([]);
      await pm.configContributions();
      expect(pm.contributions.activityBarItems).toEqual([]);
      expect(pm.contributions.secondarySidebarViews).toEqual([]);
      expect(pm.contributions.contentPanelViews).toEqual([]);
    });

    it("skips plugins without configContributions", async () => {
      const pm = new PluginManager([
        { name: "no-hook" },
        {
          name: "has-hook",
          configContributions: () => ({
            contentPanelViews: [{ viewType: "p", name: "P", component: mockContentComponent }],
          }),
        },
      ]);
      await pm.configContributions();
      expect(pm.contributions.contentPanelViews).toHaveLength(1);
    });
  });

  describe("activate", () => {
    it("calls activate on each plugin with PluginContext", async () => {
      const activateFn = vi.fn();
      const pm = new PluginManager([{ name: "test", activate: activateFn }]);
      const mockApp = createMockApp();
      const ctx = { app: mockApp, orpcClient: {} };
      await pm.activate(ctx);
      expect(activateFn).toHaveBeenCalledWith(ctx);
    });

    it("calls activate in enforce order", async () => {
      const calls: string[] = [];
      const plugins: RendererPlugin[] = [
        {
          name: "normal",
          activate: () => {
            calls.push("normal");
          },
        },
        {
          name: "post",
          enforce: "post",
          activate: () => {
            calls.push("post");
          },
        },
        {
          name: "pre",
          enforce: "pre",
          activate: () => {
            calls.push("pre");
          },
        },
      ];
      const pm = new PluginManager(plugins);
      await pm.activate(makeCtx());
      expect(calls).toEqual(["pre", "normal", "post"]);
    });

    it("skips plugins without activate", async () => {
      const activateFn = vi.fn();
      const pm = new PluginManager([
        { name: "no-hook" },
        { name: "has-hook", activate: activateFn },
      ]);
      await pm.activate(makeCtx());
      expect(activateFn).toHaveBeenCalledOnce();
    });
  });

  describe("deactivate", () => {
    it("calls deactivate on each plugin", async () => {
      const deactivateFn = vi.fn();
      const pm = new PluginManager([{ name: "test", deactivate: deactivateFn }]);
      await pm.deactivate();
      expect(deactivateFn).toHaveBeenCalledOnce();
    });
  });
});
