import { BrowserWindow, Menu, MenuItemConstructorOptions, app } from "electron";

import type { IUpdateService } from "../../shared/features/updater/types";

import { APP_NAME } from "../../shared/constants";

const isDev = !app.isPackaged;

export class ApplicationMenu {
  private updateService: IUpdateService;
  private willShutdown = false;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeUpdate: (() => void) | null = null;

  // Keep old menus around to prevent GC crash (Electron bug)
  // https://github.com/electron/electron/issues/55347
  private oldMenus: Menu[] = [];
  private gcTimer: ReturnType<typeof setTimeout> | null = null;

  private onBeforeQuit = (): void => {
    this.willShutdown = true;
  };

  constructor(updateService: IUpdateService) {
    this.updateService = updateService;
    this.unsubscribeUpdate = this.updateService.onStateChange(() => this.scheduleRebuild());
    app.on("before-quit", this.onBeforeQuit);
    this.build();
  }

  dispose(): void {
    this.unsubscribeUpdate?.();
    this.unsubscribeUpdate = null;
    app.off("before-quit", this.onBeforeQuit);
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
    if (this.gcTimer) {
      clearTimeout(this.gcTimer);
      this.gcTimer = null;
    }
    this.oldMenus = [];
  }

  private scheduleRebuild(): void {
    if (this.rebuildTimer) return;
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null;
      if (!this.willShutdown) {
        // Delay slightly to avoid rebuilding while menu is open
        setTimeout(() => {
          if (!this.willShutdown) this.build();
        }, 10);
      }
    }, 0);
  }

  private build(): void {
    const oldMenu = Menu.getApplicationMenu();
    if (oldMenu) {
      this.oldMenus.push(oldMenu);
      this.scheduleGC();
    }

    const isMac = process.platform === "darwin";

    const openSettings = (): void => {
      BrowserWindow.getFocusedWindow()?.webContents.send("menu:open-settings");
    };

    const template: MenuItemConstructorOptions[] = [
      ...(isMac
        ? [
            {
              label: APP_NAME,
              submenu: [
                { label: `About ${APP_NAME}`, click: () => app.showAboutPanel() },
                ...this.getUpdateMenuItems(),
                { type: "separator" as const },
                { label: "Settings", accelerator: "CmdOrCtrl+,", click: openSettings },
                { type: "separator" as const },
                { role: "hide" as const },
                { role: "hideOthers" as const },
                { role: "unhide" as const },
                { type: "separator" as const },
                { role: "quit" as const },
              ],
            },
          ]
        : [
            {
              label: "File",
              submenu: [
                { label: "Settings", accelerator: "CmdOrCtrl+,", click: openSettings },
                { type: "separator" as const },
                { role: "quit" as const },
              ],
            },
          ]),
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          ...(isDev
            ? [
                { role: "reload" as const },
                { role: "forceReload" as const },
                { type: "separator" as const },
              ]
            : []),
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
          { type: "separator" },
          { role: "toggleDevTools" },
        ],
      },
      {
        label: "Window",
        submenu: [
          { role: "minimize" },
          { role: "close" },
          ...(isMac
            ? [
                { role: "zoom" as const },
                { type: "separator" as const },
                { role: "front" as const },
              ]
            : []),
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private getUpdateMenuItems(): MenuItemConstructorOptions[] {
    const state = this.updateService.state;

    switch (state.status) {
      case "idle":
      case "up-to-date":
      case "error":
        return [{ label: "Check for Updates", click: () => this.updateService.check(true) }];

      case "checking":
        return [{ label: "Checking for Updates\u2026", enabled: false }];

      case "downloading":
        return [{ label: "Downloading Update\u2026", enabled: false }];

      case "ready":
        return [{ label: "Restart to Update", click: () => this.updateService.install() }];

      default:
        return [];
    }
  }

  private scheduleGC(): void {
    if (this.gcTimer) return;
    this.gcTimer = setTimeout(() => {
      this.oldMenus = [];
      this.gcTimer = null;
    }, 10_000);
  }
}
