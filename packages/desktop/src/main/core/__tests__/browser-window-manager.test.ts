import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  default: {
    screen: { getDisplayMatching: () => ({ workAreaSize: { width: 1920 } }) },
    shell: { openExternal: vi.fn() },
    BrowserWindow: vi.fn(),
  },
  screen: { getDisplayMatching: () => ({ workAreaSize: { width: 1920 } }) },
  shell: { openExternal: vi.fn() },
  BrowserWindow: vi.fn(),
}));

vi.mock("electron-store", () => {
  return {
    default: class MockStore {
      get = vi.fn();
      set = vi.fn();
    },
  };
});

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: false },
}));

vi.mock("../../../../resources/icon.png?asset", () => ({
  default: "mock-icon-path",
}));

import { BrowserWindowManager } from "../browser-window-manager";

const stubAnalytics = { track: vi.fn() } as never;

function mockBrowserWindow(width: number, height: number, minWidth = 900, minHeight = 600) {
  return {
    getSize: vi.fn(() => [width, height]),
    getMinimumSize: vi.fn(() => [minWidth, minHeight]),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width, height })),
    setMinimumSize: vi.fn(),
    setSize: vi.fn(),
  };
}

function createManagerWithWindow(win: ReturnType<typeof mockBrowserWindow>): BrowserWindowManager {
  const manager = new BrowserWindowManager({ analytics: stubAnalytics });
  Object.defineProperty(manager, "mainWindow", { get: () => win, configurable: true });
  return manager;
}

describe("BrowserWindowManager.ensureMinWidth", () => {
  it("sets minimum size and resizes when current width is smaller", () => {
    const win = mockBrowserWindow(800, 600);
    const manager = createManagerWithWindow(win);

    manager.ensureMinWidth(1000);

    expect(win.setMinimumSize).toHaveBeenCalledWith(1000, 600);
    expect(win.setSize).toHaveBeenCalledWith(1000, 600);
  });

  it("updates minimum size but does not resize when width is sufficient", () => {
    const win = mockBrowserWindow(1200, 800);
    const manager = createManagerWithWindow(win);

    manager.ensureMinWidth(1000);

    expect(win.setMinimumSize).toHaveBeenCalledWith(1000, 600);
    expect(win.setSize).not.toHaveBeenCalled();
  });

  it("never lowers minimum size below 900 even when panels collapse", () => {
    const win = mockBrowserWindow(1200, 800, 1000, 600);
    const manager = createManagerWithWindow(win);

    manager.ensureMinWidth(700);

    expect(win.setMinimumSize).toHaveBeenCalledWith(783, 600);
    expect(win.setSize).not.toHaveBeenCalled();
  });

  it("caps minWidth to display work area", () => {
    const win = mockBrowserWindow(1200, 800);
    const manager = createManagerWithWindow(win);

    manager.ensureMinWidth(2500);

    expect(win.setMinimumSize).toHaveBeenCalledWith(1920, 600);
  });

  it("no-ops when mainWindow is null", () => {
    const manager = new BrowserWindowManager({ analytics: stubAnalytics });
    manager.ensureMinWidth(1000);
  });
});
