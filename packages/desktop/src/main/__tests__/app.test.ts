import { describe, it, expect, vi } from "vitest";
import type { MainPlugin } from "../core/plugin/types";
import type { IBrowserWindowManager } from "../core/types";

function makeWindowManager(): IBrowserWindowManager {
  return {
    mainWindow: null,
    createMainWindow: vi.fn().mockReturnValue({}),
    open: vi.fn(),
    close: vi.fn(),
    destroyAll: vi.fn(),
  } as unknown as IBrowserWindowManager;
}

describe("MainApp", () => {
  it("exposes pluginManager", async () => {
    const { MainApp } = await import("../app");
    const app = new MainApp({ windowManager: makeWindowManager() });
    expect(app.pluginManager).toBeDefined();
  });

  it("exposes subscriptions", async () => {
    const { MainApp } = await import("../app");
    const app = new MainApp({ windowManager: makeWindowManager() });
    expect(typeof app.subscriptions.push).toBe("function");
  });

  it("exposes windowManager (the injected instance)", async () => {
    const { MainApp } = await import("../app");
    const wm = makeWindowManager();
    const app = new MainApp({ windowManager: wm });
    expect(app.windowManager).toBe(wm);
  });

  it("registers plugins passed in options", async () => {
    const { MainApp } = await import("../app");
    const plugin: MainPlugin = { name: "test" };
    const app = new MainApp({ plugins: [plugin], windowManager: makeWindowManager() });
    expect(app.pluginManager.getPlugins()).toContain(plugin);
  });

  it("start() calls configContributions, activate, then createMainWindow in order", async () => {
    const { MainApp } = await import("../app");
    const order: string[] = [];
    const plugin: MainPlugin = {
      name: "test",
      configContributions: () => { order.push("config"); return {}; },
      activate: () => { order.push("activate"); },
    };
    const wm = makeWindowManager();
    (wm.createMainWindow as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push("createMainWindow");
      return {};
    });

    const app = new MainApp({ plugins: [plugin], windowManager: wm });
    await app.start();

    expect(order).toEqual(["config", "activate", "createMainWindow"]);
  });

  it("stop() calls deactivate, destroyAll, and subscriptions.dispose", async () => {
    const { MainApp } = await import("../app");
    const wm = makeWindowManager();
    const app = new MainApp({ windowManager: wm });
    const deactivateSpy = vi.spyOn(app.pluginManager, "deactivate");
    const disposeSpy = vi.spyOn(app.subscriptions, "dispose");

    await app.stop();

    expect(deactivateSpy).toHaveBeenCalled();
    expect(wm.destroyAll).toHaveBeenCalled();
    expect(disposeSpy).toHaveBeenCalled();
  });
});
