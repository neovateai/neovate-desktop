import { Menu, BrowserWindow, MenuItemConstructorOptions, app } from "electron";

import { APP_NAME } from "../../shared/constants";

const isDev = !app.isPackaged;

export function setupApplicationMenu(mainWindow: BrowserWindow | null): void {
  const isMac = process.platform === "darwin";

  const openSettings = (): void => {
    mainWindow?.webContents.send("menu:open-settings");
  };

  const template: MenuItemConstructorOptions[] = [
    // App menu (macOS) / File menu (Windows/Linux)
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: "about" as const },
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
    // Edit menu
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
    // View menu
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
    // Window menu
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" },
        ...(isMac
          ? [{ role: "zoom" as const }, { type: "separator" as const }, { role: "front" as const }]
          : []),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
