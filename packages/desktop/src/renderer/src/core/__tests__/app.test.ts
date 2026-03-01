import { describe, it, expect } from "vitest";
import { RendererApp } from "../app";

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
});
