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
              {
                label: "Settings",
                click: () => {
                  mainWindow?.webContents.send("menu:open-settings");
                },
              },
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
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    // View menu
    {
      label: "View",
      submenu: [{ role: "toggleDevTools" as const }],
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
