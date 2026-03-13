import { describe, it, expect, vi } from "vitest";

vi.mock("../../orpc", () => ({ client: {} }));

import { computeTotalWidth } from "../../components/app-layout/layout-coordinator";
import { layoutStore } from "../../components/app-layout/store";
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

  it("maximizes content panel via workbench layout API", async () => {
    const app = new RendererApp({ plugins: [] });
    await app.pluginManager.configContributions();
    app.initWorkbench();

    const previousPanels = layoutStore.getState().panels;
    const previousWindow = (globalThis as any).window;

    try {
      layoutStore.setState({
        panels: {
          primarySidebar: { width: 300, collapsed: false },
          chatPanel: { width: 500, collapsed: false },
          contentPanel: { width: 300, collapsed: false },
          secondarySidebar: { width: 240, collapsed: true, activeView: "git" },
        },
      });

      (globalThis as any).window = { innerWidth: 1400 };

      const before = layoutStore.getState().panels;

      await app.workbench.layout.maximizePart("contentPanel");

      const afterFirstMaximize = layoutStore.getState().panels;
      expect(afterFirstMaximize.contentPanel.width).toBeGreaterThan(before.contentPanel.width);
      expect(computeTotalWidth(afterFirstMaximize)).toBeLessThanOrEqual(1400);

      await app.workbench.layout.maximizePart("contentPanel");

      const afterSecondMaximize = layoutStore.getState().panels;
      expect(afterSecondMaximize).toEqual(afterFirstMaximize);
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = previousWindow;
      }
      layoutStore.setState({ panels: previousPanels });
    }
  });

  it("no-ops maximizePart when content panel is collapsed", async () => {
    const app = new RendererApp({ plugins: [] });
    await app.pluginManager.configContributions();
    app.initWorkbench();

    const previousPanels = layoutStore.getState().panels;
    const previousWindow = (globalThis as any).window;

    try {
      layoutStore.setState({
        panels: {
          primarySidebar: { width: 300, collapsed: false },
          chatPanel: { width: 500, collapsed: false },
          contentPanel: { width: 300, collapsed: true },
          secondarySidebar: { width: 240, collapsed: true, activeView: "git" },
        },
      });

      (globalThis as any).window = { innerWidth: 1400 };

      const before = layoutStore.getState().panels;

      await app.workbench.layout.maximizePart("contentPanel");

      expect(layoutStore.getState().panels).toBe(before);
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = previousWindow;
      }
      layoutStore.setState({ panels: previousPanels });
    }
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
