import { is } from "@electron-toolkit/utils";
import { app, dialog, shell, screen, BrowserWindow } from "electron";
import Store from "electron-store";
import { randomUUID } from "node:crypto";
import { join } from "path";

import type { IBrowserWindowManager, OpenWindowOptions } from "./types";

import icon from "../../../resources/icon.png?asset";
import { APP_NAME } from "../../shared/constants";
import { APP_DATA_DIR } from "./app-paths";
import log from "./logger";

// fixed(48) + primarySidebar.min(250) + chatPanel comfortable min(480) + 1 handle(5)
const MAIN_WINDOW_MIN_WIDTH = 783;

type WindowStore = {
  bounds: Electron.Rectangle;
  isMaximized: boolean;
  isFullScreen: boolean;
};

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
  #isQuitting = false;
  #quitConfirmed = false;
  #showingQuitDialog = false;
  #store = new Store<WindowStore>({
    name: "window-state",
    cwd: APP_DATA_DIR,
    serialize: (value) => JSON.stringify(value, null, 2) + "\n",
  });

  prepareForQuit(): void {
    this.#isQuitting = true;
    this.#quitConfirmed = true;
  }

  get mainWindow(): BrowserWindow | null {
    return this.#mainWindow;
  }

  createMainWindow(): BrowserWindow {
    const saved = this.#store.get("bounds");
    const bounds =
      saved && this.#isVisibleOnAnyDisplay(saved) ? saved : { width: 1200, height: 800 };
    const wasMaximized = this.#store.get("isMaximized") ?? false;
    const wasFullScreen = this.#store.get("isFullScreen") ?? false;

    const win = new BrowserWindow({
      ...bounds,
      minWidth: MAIN_WINDOW_MIN_WIDTH,
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

    win.on("ready-to-show", () => {
      if (wasFullScreen) {
        win.setFullScreen(true);
      } else if (wasMaximized) {
        win.maximize();
      }
      win.show();
    });

    win.webContents.setWindowOpenHandler((details) => {
      const url = details.url;
      if (/^https?:\/\//.test(url)) {
        shell.openExternal(url).catch((err) => {
          log.warn("Failed to open external URL: %s %O", url, err);
        });
      } else {
        log.debug("Blocked non-http URL from opening externally: %s", url);
      }
      return { action: "deny" };
    });

    this.#fixDevToolsFonts(win);

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const saveState = () => {
      this.#store.set("bounds", win.getNormalBounds());
      this.#store.set("isMaximized", win.isMaximized());
      this.#store.set("isFullScreen", win.isFullScreen());
    };
    const debouncedSave = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveState, 500);
    };

    win.on("resize", debouncedSave);
    win.on("move", debouncedSave);
    win.on("maximize", debouncedSave);
    win.on("unmaximize", debouncedSave);
    win.on("enter-full-screen", debouncedSave);
    win.on("leave-full-screen", debouncedSave);

    if (process.platform === "darwin") {
      app.on("before-quit", (e) => {
        if (this.#quitConfirmed) {
          this.#isQuitting = true;
          return;
        }
        e.preventDefault();
        if (this.#showingQuitDialog) return;
        this.#showQuitConfirmation(() => {
          this.#quitConfirmed = true;
          app.quit();
        });
      });
    }

    win.on("close", (e) => {
      if (saveTimer) clearTimeout(saveTimer);
      saveState();
      if (process.platform === "darwin" && !this.#isQuitting) {
        e.preventDefault();
        win.hide();
        return;
      }
      // Windows/Linux: confirm before closing (which triggers quit)
      if (process.platform !== "darwin" && !this.#quitConfirmed) {
        e.preventDefault();
        if (this.#showingQuitDialog) return;
        this.#showQuitConfirmation(() => {
          this.#quitConfirmed = true;
          win.close();
        });
        return;
      }
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
   * If the existing window was hidden (hideOnClose), show+focus instead of creating.
   * Renderer reads `windowType` and `windowId` from URL params.
   */
  open(options: OpenWindowOptions): void {
    const {
      windowType,
      width = 800,
      height = 600,
      x,
      y,
      title,
      parent = false,
      alwaysOnTop = false,
      skipTaskbar = false,
      type: winType,
      hideOnClose = false,
    } = options;

    // Singleton: focus/show existing window of the same type
    for (const [id, entry] of this.#windows) {
      if (entry.windowType === windowType) {
        if (!entry.win.isDestroyed()) {
          if (!entry.win.isVisible()) {
            entry.win.show();
          }
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
      ...(x !== undefined && y !== undefined ? { x, y } : {}),
      title: title ?? windowType,
      show: false,
      alwaysOnTop,
      skipTaskbar,
      ...(winType ? { type: winType } : {}),
      autoHideMenuBar: true,
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

    if (hideOnClose) {
      win.on("close", (e) => {
        if (!this.#isQuitting) {
          e.preventDefault();
          win.hide();
        }
      });
    } else {
      win.on("closed", () => this.#windows.delete(windowId));
    }

    win.webContents.on("did-fail-load", () => {
      this.#windows.delete(windowId);
      if (!win.isDestroyed()) win.destroy();
    });

    this.#pipeConsole(win);
    this.#fixDevToolsFonts(win);
    this.#windows.set(windowId, { win, windowType });
  }

  /**
   * Toggle a secondary window — show if hidden/unfocused, hide if focused.
   * Returns true if the window is now visible.
   */
  toggle(windowType: string): boolean {
    for (const [, entry] of this.#windows) {
      if (entry.windowType === windowType && !entry.win.isDestroyed()) {
        if (entry.win.isVisible() && entry.win.isFocused()) {
          entry.win.hide();
          return false;
        }
        if (!entry.win.isVisible()) {
          entry.win.show();
        }
        entry.win.focus();
        return true;
      }
    }
    return false;
  }

  /** Get a secondary window by windowType */
  getByType(windowType: string): BrowserWindow | null {
    for (const [, entry] of this.#windows) {
      if (entry.windowType === windowType && !entry.win.isDestroyed()) {
        return entry.win;
      }
    }
    return null;
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
    const capped = Math.max(Math.min(minWidth, maxWidth), MAIN_WINDOW_MIN_WIDTH);
    const [currentWidth, currentHeight] = mainWindow.getSize();
    const [, currentMinHeight] = mainWindow.getMinimumSize();
    mainWindow.setMinimumSize(capped, currentMinHeight);
    if (currentWidth < capped) {
      mainWindow.setSize(capped, currentHeight);
    }
  }

  #showQuitConfirmation(onConfirm: () => void): void {
    this.#showingQuitDialog = true;
    const win = this.#mainWindow && !this.#mainWindow.isDestroyed() ? this.#mainWindow : undefined;
    if (win && !win.isVisible()) win.show();

    const opts: Electron.MessageBoxOptions = {
      type: "question",
      title: `Quit ${APP_NAME}?`,
      message: `Quit ${APP_NAME}?`,
      detail: "Any running sessions will be interrupted.",
      buttons: ["Cancel", "Quit Anyway"],
      defaultId: 0,
      cancelId: 0,
    };

    const promise = win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts);
    promise.then(({ response }) => {
      this.#showingQuitDialog = false;
      if (response === 1) onConfirm();
    });
  }

  /** Check that saved bounds overlap at least partially with a connected display. */
  #isVisibleOnAnyDisplay(bounds: Electron.Rectangle): boolean {
    const displays = screen.getAllDisplays();
    const minOverlap = 100; // px — enough to grab the titlebar
    return displays.some((display) => {
      const { x, y, width, height } = display.workArea;
      const overlapX = Math.min(bounds.x + bounds.width, x + width) - Math.max(bounds.x, x);
      const overlapY = Math.min(bounds.y + bounds.height, y + height) - Math.max(bounds.y, y);
      return overlapX >= minOverlap && overlapY >= 40;
    });
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
