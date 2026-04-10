import debug from "debug";

import type { MainPlugin } from "../../core/plugin/types";

import { BrowserViewManager } from "./browser-view-manager";
import { createBrowserRouter } from "./router";

const log = debug("neovate:browser");

let manager: BrowserViewManager | null = null;

export default {
  name: "browser",
  configContributions: (ctx) => {
    manager = new BrowserViewManager(ctx.app.windowManager);
    return {
      router: createBrowserRouter(ctx.orpcServer, manager),
    };
  },
  deactivate: () => {
    log("deactivating browser plugin");
    manager?.destroyAll();
    manager = null;
  },
} satisfies MainPlugin;
