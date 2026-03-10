import { describe, it, expect, vi, beforeEach } from "vitest";

import type { MainPlugin } from "../core/plugin/types";

const { mockCreateMainWindow, mockDestroyAll } = vi.hoisted(() => ({
  mockCreateMainWindow: vi.fn().mockReturnValue({}),
  mockDestroyAll: vi.fn(),
}));

vi.mock("electron-store", () => ({
  default: vi.fn(function (this: any) {
    let data: Record<string, unknown> = {};
    this.get = function (key: string) {
      const parts = key.split(".");
      let current: any = data;
      for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
      }
      return current;
    };
    this.set = function (keyOrObj: string | Record<string, unknown>, value?: unknown) {
      if (typeof keyOrObj === "string") {
        const parts = keyOrObj.split(".");
        let current: any = data;
        for (let i = 0; i < parts.length - 1; i++) {
          if (current[parts[i]] == null) current[parts[i]] = {};
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
      } else {
        Object.assign(data, keyOrObj);
      }
    };
    this.delete = function (key: string) {
      const parts = key.split(".");
      let current: any = data;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current == null) return;
        current = current[parts[i]];
      }
      if (current != null) delete current[parts[parts.length - 1]];
    };
    Object.defineProperty(this, "store", {
      get() {
        return data;
      },
    });
    this.clear = function () {
      data = {};
    };
  }),
}));

vi.mock("../core", () => ({
  BrowserWindowManager: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.mainWindow = null;
    this.createMainWindow = mockCreateMainWindow;
    this.open = vi.fn();
    this.close = vi.fn();
    this.destroyAll = mockDestroyAll;
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMainWindow.mockReturnValue({});
});

describe("MainApp", () => {
  it("exposes pluginManager", async () => {
    const { MainApp } = await import("../app");
    const app = new MainApp({});
    expect(app.pluginManager).toBeDefined();
  });

  it("exposes subscriptions", async () => {
    const { MainApp } = await import("../app");
    const app = new MainApp({});
    expect(typeof app.subscriptions.push).toBe("function");
  });

  it("exposes windowManager", async () => {
    const { MainApp } = await import("../app");
    const app = new MainApp({});
    expect(app.windowManager).toBeDefined();
  });

  it("registers plugins passed in options", async () => {
    const { MainApp } = await import("../app");
    const plugin: MainPlugin = { name: "test" };
    const app = new MainApp({ plugins: [plugin] });
    expect(app.pluginManager.getPlugins()).toContain(plugin);
  });

  it("start() calls configContributions, activate, then createMainWindow in order", async () => {
    const { MainApp } = await import("../app");
    const order: string[] = [];
    const plugin: MainPlugin = {
      name: "test",
      configContributions: () => {
        order.push("config");
        return {};
      },
      activate: () => {
        order.push("activate");
      },
    };
    mockCreateMainWindow.mockImplementation(() => {
      order.push("createMainWindow");
      return {};
    });

    const app = new MainApp({ plugins: [plugin] });
    await app.start();

    expect(order).toEqual(["config", "activate", "createMainWindow"]);
  });

  it("stop() calls deactivate, destroyAll, and subscriptions.dispose", async () => {
    const { MainApp } = await import("../app");
    const app = new MainApp({});
    const deactivateSpy = vi.spyOn(app.pluginManager, "deactivate");
    const disposeSpy = vi.spyOn(app.subscriptions, "dispose");

    await app.stop();

    expect(deactivateSpy).toHaveBeenCalled();
    expect(mockDestroyAll).toHaveBeenCalled();
    expect(disposeSpy).toHaveBeenCalled();
  });
});
