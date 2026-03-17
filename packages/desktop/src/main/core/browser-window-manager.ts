import { is } from "@electron-toolkit/utils";
import { shell, screen, BrowserWindow } from "electron";
import Store from "electron-store";
import { randomUUID } from "node:crypto";
import { join } from "path";

import type { IBrowserWindowManager, OpenWindowOptions } from "./types";

import icon from "../../../resources/icon.png?asset";
import { APP_DATA_DIR } from "./app-paths";
import log from "./logger";

type WindowStore = { bounds: Electron.Rectangle };

function stripColors(msg: string): string {
  return msg
    .replace(/%c/g, "")
    .replace(/color:\s*[^;}\s]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export class BrowserWindowManager implements IBrowserWindowManager {
  #mainWindow: BrowserWindow | null = null;
  #windows = new Map<string, { win: BrowserWindow; windowType: string }>();
  #store = new Store<WindowStore>({
    name: "window-state",
    cwd: APP_DATA_DIR,
    serialize: (value) => JSON.stringify(value, null, 2) + "\n",
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
        webviewTag: true,
      },
    });

    win.on("ready-to-show", () => win.show());

    win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });

    this.#fixDevToolsFonts(win);

    win.on("close", () => {
      this.#store.set("bounds", win.getNormalBounds());
    });

    win.on("closed", () => {
      this.#mainWindow = null;
    });

    this.#pipeConsole(win);
    this.#loadURL(win);
    this.#mainWindow = win;
    return win;
  }

  /**
   * Open a secondary window.
   * Singleton by windowType — focuses existing window of the same type.
   * Renderer reads `windowType` and `windowId` from URL params.
   */
  open(options: OpenWindowOptions): void {
    const { windowType, width = 800, height = 600, title, parent = false } = options;

    // Singleton: focus existing window of the same type
    for (const [id, entry] of this.#windows) {
      if (entry.windowType === windowType) {
        if (!entry.win.isDestroyed()) {
          entry.win.focus();
          return;
        }
        this.#windows.delete(id);
      }
    }

    const windowId = `${windowType}_${randomUUID()}`;
    const win = new BrowserWindow({
      width,
      height,
      title: title ?? windowType,
      show: false,
      ...(parent && this.#mainWindow ? { parent: this.#mainWindow } : {}),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
        webviewTag: true,
      },
    });

    win.on("ready-to-show", () => win.show());

    const { windowId: _, windowType: __, ...safeParams } = options.urlSearchParams ?? {};
    const params = new URLSearchParams({ windowId, windowType, ...safeParams });
    this.#loadURL(win, params);

    win.on("closed", () => this.#windows.delete(windowId));
    win.webContents.on("did-fail-load", () => {
      this.#windows.delete(windowId);
      if (!win.isDestroyed()) win.close();
    });

    this.#pipeConsole(win);
    this.#fixDevToolsFonts(win);
    this.#windows.set(windowId, { win, windowType });
  }

  close(windowId: string): void {
    const entry = this.#windows.get(windowId);
    if (entry && !entry.win.isDestroyed()) entry.win.close();
  }

  destroyAll(): void {
    if (this.#mainWindow && !this.#mainWindow.isDestroyed()) {
      this.#mainWindow.destroy();
      this.#mainWindow = null;
    }
    for (const { win } of this.#windows.values()) {
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

  #fixDevToolsFonts(win: BrowserWindow): void {
    win.webContents.on("devtools-opened", () => {
      win.webContents.devToolsWebContents?.executeJavaScript(`
        const s = document.createElement('style');
        s.textContent = 'body, * { font-family: system-ui, -apple-system, sans-serif !important; } .monospace, .source-code, .CodeMirror pre { font-family: Menlo, Consolas, monospace !important; }';
        document.head.appendChild(s);
      `);
    });
  }

  static #logFns = [log.verbose, log.info, log.warn, log.error] as const;

  #pipeConsole(win: BrowserWindow): void {
    win.webContents.on("console-message", (_e, level, message) => {
      const clean = stripColors(message);
      if (clean.includes("react-grab.com")) return;
      const fn = BrowserWindowManager.#logFns[level] ?? log.info;
      fn(`[renderer] ${clean}`);
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
