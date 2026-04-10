import { EventPublisher } from "@orpc/server";
import debug from "debug";
import { WebContentsView } from "electron";

import type { BrowserBounds, BrowserEvent } from "../../../shared/plugins/browser/contract";
import type { IBrowserWindowManager } from "../../core/types";

import { INJECT_SCRIPT } from "./inject-script";

const log = debug("neovate:browser:manager");

const GRAB_PREFIX = "BROWSER_PLUGIN:";

interface ManagedView {
  view: WebContentsView;
  publisher: EventPublisher<{ "browser-event": BrowserEvent }>;
  bounds: BrowserBounds;
  visible: boolean;
}

export class BrowserViewManager {
  #views = new Map<string, ManagedView>();
  #windowManager: IBrowserWindowManager;

  constructor(windowManager: IBrowserWindowManager) {
    this.#windowManager = windowManager;
  }

  create(viewId: string, url?: string, bounds?: BrowserBounds): boolean {
    if (this.#views.has(viewId)) {
      log("view already exists: %s", viewId);
      return false;
    }

    const mainWindow = this.#windowManager.mainWindow;
    if (!mainWindow) {
      log("no main window available");
      return false;
    }

    const view = new WebContentsView();
    const publisher = new EventPublisher<{ "browser-event": BrowserEvent }>();
    const resolvedBounds = bounds ?? { x: 0, y: 0, width: 0, height: 0 };

    const managed: ManagedView = {
      view,
      publisher,
      bounds: resolvedBounds,
      visible: true,
    };
    this.#views.set(viewId, managed);

    const wc = view.webContents;

    wc.on("dom-ready", () => {
      log("dom-ready: %s", viewId);
      wc.executeJavaScript(INJECT_SCRIPT).catch(() => {});
    });

    wc.on("did-start-loading", () => {
      publisher.publish("browser-event", {
        type: "loading",
        detail: { isLoading: true },
      });
    });

    wc.on("did-stop-loading", () => {
      publisher.publish("browser-event", {
        type: "loading",
        detail: {
          isLoading: false,
          canGoBack: wc.canGoBack(),
          canGoForward: wc.canGoForward(),
        },
      });
    });

    wc.on("did-navigate", (_e, navUrl) => {
      log("did-navigate: %s -> %s", viewId, navUrl);
      publisher.publish("browser-event", {
        type: "navigation",
        detail: {
          url: navUrl,
          canGoBack: wc.canGoBack(),
          canGoForward: wc.canGoForward(),
        },
      });
    });

    wc.on("did-navigate-in-page", (_e, navUrl) => {
      log("did-navigate-in-page: %s -> %s", viewId, navUrl);
      publisher.publish("browser-event", {
        type: "navigation",
        detail: {
          url: navUrl,
          canGoBack: wc.canGoBack(),
          canGoForward: wc.canGoForward(),
        },
      });
    });

    wc.on("page-title-updated", (_e, title) => {
      publisher.publish("browser-event", {
        type: "title",
        detail: { title },
      });
    });

    wc.on("console-message", (_e, _level, message) => {
      if (!message.startsWith(GRAB_PREFIX)) return;
      try {
        const { active } = JSON.parse(message.slice(GRAB_PREFIX.length));
        if (active !== undefined) {
          publisher.publish("browser-event", {
            type: "inspector",
            detail: { active },
          });
        }
      } catch {
        // ignore parse errors
      }
    });

    // Intercept new window requests — load in the same view
    wc.setWindowOpenHandler(({ url: targetUrl }) => {
      log("new-window intercepted: %s -> %s", viewId, targetUrl);
      if (targetUrl) {
        wc.loadURL(targetUrl);
      }
      return { action: "deny" };
    });

    // Add to main window
    mainWindow.contentView.addChildView(view);
    view.setBounds(this.#roundBounds(resolvedBounds));

    if (url) {
      wc.loadURL(url).catch((err) => {
        log("loadURL failed: %s %O", viewId, err);
      });
    }

    log("created view: %s", viewId);
    return true;
  }

  destroy(viewId: string): void {
    const managed = this.#views.get(viewId);
    if (!managed) return;

    const mainWindow = this.#windowManager.mainWindow;
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.contentView.removeChildView(managed.view);
      } catch {
        // view may already be removed
      }
    }

    try {
      managed.view.webContents.close();
    } catch {
      // already closed
    }

    this.#views.delete(viewId);
    log("destroyed view: %s", viewId);
  }

  navigate(viewId: string, url: string): void {
    const managed = this.#views.get(viewId);
    if (!managed) return;
    managed.view.webContents.loadURL(url).catch((err) => {
      log("navigate failed: %s %O", viewId, err);
    });
  }

  goBack(viewId: string): void {
    this.#views.get(viewId)?.view.webContents.goBack();
  }

  goForward(viewId: string): void {
    this.#views.get(viewId)?.view.webContents.goForward();
  }

  reload(viewId: string): void {
    this.#views.get(viewId)?.view.webContents.reload();
  }

  openDevTools(viewId: string): void {
    this.#views.get(viewId)?.view.webContents.openDevTools();
  }

  async executeJS(viewId: string, code: string): Promise<{ result?: unknown; error?: string }> {
    const managed = this.#views.get(viewId);
    if (!managed) return { error: "View not found" };
    try {
      const result = await managed.view.webContents.executeJavaScript(code);
      return { result };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  setBounds(viewId: string, bounds: BrowserBounds): void {
    const managed = this.#views.get(viewId);
    if (!managed) return;
    managed.bounds = bounds;
    if (managed.visible) {
      managed.view.setBounds(this.#roundBounds(bounds));
    }
  }

  setVisible(viewId: string, visible: boolean): void {
    const managed = this.#views.get(viewId);
    if (!managed || managed.visible === visible) return;

    const mainWindow = this.#windowManager.mainWindow;
    if (!mainWindow || mainWindow.isDestroyed()) return;

    managed.visible = visible;
    if (visible) {
      mainWindow.contentView.addChildView(managed.view);
      managed.view.setBounds(this.#roundBounds(managed.bounds));
    } else {
      mainWindow.contentView.removeChildView(managed.view);
    }
    log("setVisible: %s -> %s", viewId, visible);
  }

  getPublisher(viewId: string): EventPublisher<{ "browser-event": BrowserEvent }> | undefined {
    return this.#views.get(viewId)?.publisher;
  }

  destroyAll(): void {
    const viewIds = Array.from(this.#views.keys());
    for (const viewId of viewIds) {
      this.destroy(viewId);
    }
  }

  #roundBounds(bounds: BrowserBounds): Electron.Rectangle {
    return {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
  }
}
