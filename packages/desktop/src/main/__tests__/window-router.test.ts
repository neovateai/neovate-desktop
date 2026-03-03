import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  screen: {
    getDisplayMatching: () => ({ workAreaSize: { width: 1920 } }),
  },
}));

import { buildRouter, type AppDependencies } from "../router";

const router = buildRouter(new Map());

function mockBrowserWindow(width: number, height: number, minWidth = 900, minHeight = 600) {
  return {
    getSize: vi.fn(() => [width, height]),
    getMinimumSize: vi.fn(() => [minWidth, minHeight]),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width, height })),
    setMinimumSize: vi.fn(),
    setSize: vi.fn(),
  };
}

function makeContext(mainWindow: ReturnType<typeof mockBrowserWindow>): AppDependencies {
  return {
    acpConnectionManager: {} as unknown as AppDependencies["acpConnectionManager"],
    projectStore: {} as unknown as AppDependencies["projectStore"],
    mainWindow: mainWindow as unknown as AppDependencies["mainWindow"],
  };
}

describe("window.ensureWidth", () => {
  it("sets minimum size and resizes when current width is smaller", async () => {
    const win = mockBrowserWindow(800, 600);
    const context = makeContext(win);

    await call(router.window.ensureWidth, { minWidth: 1000 }, { context });

    expect(win.setMinimumSize).toHaveBeenCalledWith(1000, 600);
    expect(win.setSize).toHaveBeenCalledWith(1000, 600);
  });

  it("updates minimum size but does not resize when width is sufficient", async () => {
    const win = mockBrowserWindow(1200, 800);
    const context = makeContext(win);

    await call(router.window.ensureWidth, { minWidth: 1000 }, { context });

    expect(win.setMinimumSize).toHaveBeenCalledWith(1000, 600);
    expect(win.setSize).not.toHaveBeenCalled();
  });

  it("lowers minimum size when panels collapse", async () => {
    const win = mockBrowserWindow(1200, 800, 1000, 600);
    const context = makeContext(win);

    await call(router.window.ensureWidth, { minWidth: 700 }, { context });

    expect(win.setMinimumSize).toHaveBeenCalledWith(700, 600);
    expect(win.setSize).not.toHaveBeenCalled();
  });

  it("caps minWidth to display work area", async () => {
    const win = mockBrowserWindow(1200, 800);
    const context = makeContext(win);

    await call(router.window.ensureWidth, { minWidth: 2500 }, { context });

    expect(win.setMinimumSize).toHaveBeenCalledWith(1920, 600);
  });
});
