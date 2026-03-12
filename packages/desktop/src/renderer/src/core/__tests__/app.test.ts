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

  it("exposes workbench layout and contentPanel after initWorkbench", async () => {
    const app = new RendererApp({ plugins: [] });
    await app.pluginManager.configContributions();
    app.initWorkbench();
    expect(app.workbench).toBeDefined();
    expect(app.workbench.layout).toBeDefined();
    expect(typeof app.workbench.layout.expandPart).toBe("function");
    expect(app.workbench.contentPanel).toBeDefined();
    expect(typeof app.workbench.contentPanel.openView).toBe("function");
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
