import { Menu, BrowserWindow } from "electron";

export function setupApplicationMenu(mainWindow: BrowserWindow | null): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac
      ? [
          {
            label: "Neovate",
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              {
                label: "Settings",
                click: () => {
                  mainWindow?.webContents.send("menu:open-settings");
                },
              },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    // Edit menu
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle" as const },
              { role: "delete" as const },
              { role: "selectAll" as const },
            ]
          : [{ role: "selectAll" as const }]),
      ],
    },
    // View menu
    {
      label: "View",
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    // Window menu
    {
      label: "Window",
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
              { type: "separator" as const },
              { role: "window" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },
    // Help menu
    {
      role: "help" as const,
      submenu: [
        {
          label: "Learn More",
          click: async () => {
            const { shell } = await import("electron");
            await shell.openExternal("https://github.com/neovate");
          },
        },
      ],
    },
  ];

  // Add Settings to File menu on Windows/Linux
  if (!isMac) {
    template.unshift({
      label: "File",
      submenu: [
        {
          label: "Settings",
          click: () => {
            mainWindow?.webContents.send("menu:open-settings");
          },
        },
        { type: "separator" as const },
        { role: "quit" as const },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
