import { describe, it, expect, vi } from "vitest";

vi.mock("../../orpc", () => ({ client: {} }));

import { RendererApp } from "../app";
import { toDisposable } from "../disposable";

describe("RendererApp", () => {
  it("exposes pluginManager", () => {
    const app = new RendererApp({ plugins: [] });
    expect(app.pluginManager).toBeDefined();
  });

  it("exposes disposable store", () => {
    const app = new RendererApp({ plugins: [] });
    expect(app.subscriptions).toBeDefined();
    expect(typeof app.subscriptions.push).toBe("function");
    expect(typeof app.subscriptions.dispose).toBe("function");
  });

  it("exposes workbench.contentPanel after initWorkbench", async () => {
    const app = new RendererApp({ plugins: [] });
    await app.pluginManager.configContributions();
    app.initWorkbench();
    expect(app.workbench).toBeDefined();
    expect(app.workbench.contentPanel).toBeDefined();
    expect(typeof app.workbench.contentPanel.openView).toBe("function");
  });

  it("reads windowType and windowId from URL params", () => {
    (globalThis as any).window = {
      location: { search: "?windowType=companion&windowId=companion-1" },
    };
    const app = new RendererApp({ plugins: [] });
    expect(app.windowType).toBe("companion");
    expect(app.windowId).toBe("companion-1");
    delete (globalThis as any).window;
  });

  it("defaults windowType to main and windowId to main", () => {
    const app = new RendererApp({ plugins: [] });
    expect(app.windowType).toBe("main");
    expect(app.windowId).toBe("main");
  });

  it("stop() deactivates plugins and disposes subscriptions", async () => {
    const deactivateFn = vi.fn();
    const disposeFn = vi.fn();
    const app = new RendererApp({
      plugins: [{ name: "test", deactivate: deactivateFn }],
    });
    await app.pluginManager.configContributions();
    app.initWorkbench();
    app.subscriptions.push(toDisposable(disposeFn));
    await app.stop();
    expect(deactivateFn).toHaveBeenCalledOnce();
    expect(disposeFn).toHaveBeenCalledOnce();
  });
});
