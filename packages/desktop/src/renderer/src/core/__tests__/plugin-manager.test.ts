import { describe, it, expect, vi } from "vitest";
import { PluginManager } from "../plugin/plugin-manager";
import type { IRendererApp } from "../types";
import type { RendererPlugin, SidebarPanel, ContentPanel } from "../plugin";

function createMockApp(): IRendererApp {
  return { subscriptions: { push: vi.fn() } };
}

const mockComponent: SidebarPanel["component"] = () =>
  Promise.resolve({ default: () => null });

const mockContentComponent: ContentPanel["component"] = () =>
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
            secondarySidebarPanels: [{ id: "a", title: "A", component: mockComponent }],
          }),
        },
        {
          name: "b",
          configContributions: () => ({
            secondarySidebarPanels: [{ id: "b", title: "B", component: mockComponent }],
          }),
        },
      ];
      const pm = new PluginManager(plugins);
      await pm.configContributions();
      expect(pm.contributions.secondarySidebarPanels).toHaveLength(2);
    });

    it("sorts activityBarItems by order", async () => {
      const MockIcon = () => null;
      const pm = new PluginManager([{
        name: "test",
        configContributions: () => ({
          activityBarItems: [
            { id: "z", icon: MockIcon, tooltip: "Z", panelId: "z", order: 30 },
            { id: "a", icon: MockIcon, tooltip: "A", panelId: "a", order: 10 },
          ],
        }),
      }]);
      await pm.configContributions();
      expect(pm.contributions.activityBarItems[0].id).toBe("a");
      expect(pm.contributions.activityBarItems[1].id).toBe("z");
    });

    it("returns empty contributions when no plugins", async () => {
      const pm = new PluginManager([]);
      await pm.configContributions();
      expect(pm.contributions.activityBarItems).toEqual([]);
      expect(pm.contributions.secondarySidebarPanels).toEqual([]);
      expect(pm.contributions.contentPanels).toEqual([]);
    });

    it("skips plugins without configContributions", async () => {
      const pm = new PluginManager([
        { name: "no-hook" },
        { name: "has-hook", configContributions: () => ({
          contentPanels: [{ id: "p", name: "P", component: mockContentComponent }],
        }) },
      ]);
      await pm.configContributions();
      expect(pm.contributions.contentPanels).toHaveLength(1);
    });
  });

  describe("activate", () => {
    it("calls activate on each plugin with PluginContext", async () => {
      const activateFn = vi.fn();
      const pm = new PluginManager([{ name: "test", activate: activateFn }]);
      const mockApp = createMockApp();
      await pm.activate({ app: mockApp });
      expect(activateFn).toHaveBeenCalledWith({ app: mockApp });
    });

    it("calls activate in enforce order", async () => {
      const calls: string[] = [];
      const plugins: RendererPlugin[] = [
        { name: "normal", activate: () => { calls.push("normal"); } },
        { name: "post", enforce: "post", activate: () => { calls.push("post"); } },
        { name: "pre", enforce: "pre", activate: () => { calls.push("pre"); } },
      ];
      const pm = new PluginManager(plugins);
      await pm.activate({ app: createMockApp() });
      expect(calls).toEqual(["pre", "normal", "post"]);
    });

    it("skips plugins without activate", async () => {
      const activateFn = vi.fn();
      const pm = new PluginManager([
        { name: "no-hook" },
        { name: "has-hook", activate: activateFn },
      ]);
      await pm.activate({ app: createMockApp() });
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
