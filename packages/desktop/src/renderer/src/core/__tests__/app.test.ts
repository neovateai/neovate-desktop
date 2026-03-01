import { describe, it, expect, vi } from "vitest";
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

  it("stop() deactivates plugins and disposes subscriptions", async () => {
    const deactivateFn = vi.fn();
    const disposeFn = vi.fn();
    const app = new RendererApp({
      plugins: [{ name: "test", deactivate: deactivateFn }],
    });
    app.subscriptions.push(toDisposable(disposeFn));
    await app.stop();
    expect(deactivateFn).toHaveBeenCalledOnce();
    expect(disposeFn).toHaveBeenCalledOnce();
  });
});
