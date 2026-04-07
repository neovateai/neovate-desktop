import debug from "debug";
import { globalShortcut, screen } from "electron";

import type { IBrowserWindowManager } from "../../core/types";
import type { ConfigStore } from "../config/config-store";

import { PopupWindowStore } from "./popup-window-store";

const log = debug("neovate:popup-window");

const POPUP_WINDOW_TYPE = "popup-window";

export class PopupWindowShortcut {
  #configStore: ConfigStore;
  #windowManager: IBrowserWindowManager;
  #popupStore = new PopupWindowStore();
  #currentAccelerator: string | null = null;
  #unsubscribeConfig: (() => void) | null = null;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(configStore: ConfigStore, windowManager: IBrowserWindowManager) {
    this.#configStore = configStore;
    this.#windowManager = windowManager;
  }

  init(): void {
    const enabled = this.#configStore.get("popupWindowEnabled");
    if (enabled) {
      this.#register(this.#configStore.get("popupWindowShortcut"));
    }

    // React to config changes
    this.#unsubscribeConfig = this.#configStore.onAnyChange((newVal, oldVal) => {
      const enabledChanged = newVal.popupWindowEnabled !== oldVal.popupWindowEnabled;
      const shortcutChanged = newVal.popupWindowShortcut !== oldVal.popupWindowShortcut;

      if (enabledChanged || shortcutChanged) {
        this.#unregister();
        if (newVal.popupWindowEnabled) {
          this.#register(newVal.popupWindowShortcut);
        }
      }
    });
  }

  #register(accelerator: string): void {
    if (!accelerator) return;

    const success = globalShortcut.register(accelerator, () => {
      this.#toggle();
    });

    if (success) {
      this.#currentAccelerator = accelerator;
      log("registered global shortcut: %s", accelerator);
    } else {
      log("failed to register global shortcut: %s (conflict with another app)", accelerator);
    }
  }

  #unregister(): void {
    if (this.#currentAccelerator) {
      globalShortcut.unregister(this.#currentAccelerator);
      log("unregistered global shortcut: %s", this.#currentAccelerator);
      this.#currentAccelerator = null;
    }
  }

  #toggle(): void {
    // Try to toggle existing window
    if (this.#windowManager.toggle(POPUP_WINDOW_TYPE)) {
      // Window was shown — send focus event
      const win = this.#windowManager.getByType(POPUP_WINDOW_TYPE);
      if (win) {
        win.webContents.send("popup-window:shown");
      }
      return;
    }

    // Check if toggle hid the window (returns false when hidden)
    const existing = this.#windowManager.getByType(POPUP_WINDOW_TYPE);
    if (existing) {
      // Window exists but was just hidden by toggle — do nothing
      return;
    }

    // Create new popup window
    this.#create();
  }

  #create(): void {
    const { width, height } = this.#popupStore.getSize();

    // Center on display where cursor currently is
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const { x: workX, y: workY, width: workW, height: workH } = display.workArea;
    const x = Math.round(workX + (workW - width) / 2);
    const y = Math.round(workY + (workH - height) / 2);

    this.#windowManager.open({
      windowType: POPUP_WINDOW_TYPE,
      width,
      height,
      x,
      y,
      title: "Popup Window",
      alwaysOnTop: true,
      skipTaskbar: true,
      type: "panel",
      hideOnClose: true,
    });

    // Debounced size persistence
    const win = this.#windowManager.getByType(POPUP_WINDOW_TYPE);
    if (win) {
      const debouncedSave = () => {
        if (this.#saveTimer) clearTimeout(this.#saveTimer);
        this.#saveTimer = setTimeout(() => {
          if (win.isDestroyed()) return;
          const [w, h] = win.getSize();
          this.#popupStore.saveSize(w, h);
        }, 500);
      };
      win.on("resize", debouncedSave);
    }
  }

  dispose(): void {
    this.#unregister();
    if (this.#unsubscribeConfig) {
      this.#unsubscribeConfig();
      this.#unsubscribeConfig = null;
    }
    if (this.#saveTimer) {
      clearTimeout(this.#saveTimer);
    }
  }
}
