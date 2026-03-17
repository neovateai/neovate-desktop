import debug from "debug";
import { webContents } from "electron";

import type { PluginContext } from "../../core/plugin/types";

const log = debug("neovate:browser:router");

export function createBrowserRouter(orpcServer: PluginContext["orpcServer"]) {
  return orpcServer.router({
    openDevTools: orpcServer.handler(async ({ input }) => {
      const { pageWebContentsId, devToolsWebContentsId } = input as {
        pageWebContentsId: number;
        devToolsWebContentsId: number;
      };
      log("openDevTools", { pageWebContentsId, devToolsWebContentsId });

      const page = webContents.fromId(pageWebContentsId);
      const devTools = webContents.fromId(devToolsWebContentsId);
      if (!page || !devTools) {
        log("webContents not found", { page: !!page, devTools: !!devTools });
        return;
      }

      page.setDevToolsWebContents(devTools);
      page.openDevTools();
    }),

    closeDevTools: orpcServer.handler(async ({ input }) => {
      const { pageWebContentsId } = input as { pageWebContentsId: number };
      log("closeDevTools", { pageWebContentsId });

      const page = webContents.fromId(pageWebContentsId);
      if (page) page.closeDevTools();
    }),
  });
}
