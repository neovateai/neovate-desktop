import os from "node:os";
import path from "node:path";
import Store from "electron-store";
import { join } from "path";
import { shell, screen, BrowserWindow } from "electron";
import { is } from "@electron-toolkit/utils";
import icon from "../../../resources/icon.png?asset";
import type { IBrowserWindowManager, OpenWindowOptions } from "./types";

type WindowStore = { bounds: Electron.Rectangle };

export class BrowserWindowManager implements IBrowserWindowManager {
  #mainWindow: BrowserWindow | null = null;
  #windows = new Map<string, BrowserWindow>();
  #store = new Store<WindowStore>({
    name: "window-state",
    cwd: path.join(os.homedir(), ".neovate-desktop"),
  });

  get mainWindow(): BrowserWindow | null {
    return this.#mainWindow;
  }

  createMainWindow(): BrowserWindow {
    const saved = this.#store.get("bounds");
    const bounds = saved ?? { width: 1200, height: 800 };

    const win = new BrowserWindow({
      ...bounds,
      minWidth: 900,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 16 },
      ...(process.platform === "linux" ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
      },
    });

    win.on("ready-to-show", () => win.show());

    win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });

    // Persist bounds before close/hide
    win.on("close", (event) => {
      this.#store.set("bounds", win.getNormalBounds());
      if (process.platform === "darwin") {
        event.preventDefault();
        win.hide();
      }
    });

    // Only fires on non-macOS (macOS close is prevented above)
    win.on("closed", () => {
      this.#mainWindow = null;
    });

    this.#pipeConsole(win);
    this.#loadURL(win);
    this.#mainWindow = win;
    return win;
  }

  /**
   * Open a secondary window by ID.
   * Focuses existing window if already open.
   * Renderer reads `windowType` from URL params to decide what to render.
   */
  open(options: OpenWindowOptions): void {
    const { windowId, windowType, width = 800, height = 600, title, parent = false } = options;

    const existing = this.#windows.get(windowId);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }
    if (existing) this.#windows.delete(windowId);

    const win = new BrowserWindow({
      width,
      height,
      title: title ?? windowId,
      show: false,
      ...(parent && this.#mainWindow ? { parent: this.#mainWindow } : {}),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
      },
    });

    win.on("ready-to-show", () => win.show());

    const params = new URLSearchParams({ windowId, windowType, ...options.urlSearchParams });
    this.#loadURL(win, params);

    win.on("closed", () => this.#windows.delete(windowId));
    win.webContents.on("did-fail-load", () => {
      this.#windows.delete(windowId);
      if (!win.isDestroyed()) win.close();
    });

    this.#pipeConsole(win);
    this.#windows.set(windowId, win);
  }

  close(windowId: string): void {
    const win = this.#windows.get(windowId);
    if (win && !win.isDestroyed()) win.close();
  }

  destroyAll(): void {
    if (this.#mainWindow && !this.#mainWindow.isDestroyed()) {
      this.#mainWindow.destroy();
      this.#mainWindow = null;
    }
    for (const win of this.#windows.values()) {
      if (!win.isDestroyed()) win.destroy();
    }
    this.#windows.clear();
  }

  ensureMinWidth(minWidth: number): void {
    const mainWindow = this.mainWindow;
    if (!mainWindow) return;
    const display = screen.getDisplayMatching(mainWindow.getBounds());
    const maxWidth = display.workAreaSize.width;
    const capped = Math.min(minWidth, maxWidth);
    const [currentWidth, currentHeight] = mainWindow.getSize();
    const [, currentMinHeight] = mainWindow.getMinimumSize();
    mainWindow.setMinimumSize(capped, currentMinHeight);
    if (currentWidth < capped) {
      mainWindow.setSize(capped, currentHeight);
    }
  }

  static #levels = ["verbose", "info", "warning", "error"] as const;

  #pipeConsole(win: BrowserWindow): void {
    win.webContents.on("console-message", (_e, level, message) => {
      const tag = BrowserWindowManager.#levels[level] ?? "log";
      process.stderr.write(`[renderer:${tag}] ${message}\n`);
    });
  }

  #loadURL(win: BrowserWindow, params?: URLSearchParams): void {
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      const url = new URL(process.env["ELECTRON_RENDERER_URL"]);
      if (params) url.search = params.toString();
      win.loadURL(url.toString());
    } else {
      win.loadFile(
        join(__dirname, "../renderer/index.html"),
        params ? { search: params.toString() } : {},
      );
    }
  }
}
