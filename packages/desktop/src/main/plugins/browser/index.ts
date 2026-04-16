import debug from "debug";
import { webContents } from "electron";

import type { MainPlugin, PluginContext } from "../../core/plugin/types";

const log = debug("neovate:browser");

function createBrowserRouter(orpcServer: PluginContext["orpcServer"]) {
  return orpcServer.router({
    attachDevTools: orpcServer.handler(({ input }) => {
      const { sourceId, targetId } = input as {
        sourceId: number;
        targetId: number;
      };
      const source = webContents.fromId(sourceId);
      const target = webContents.fromId(targetId);

      try {
        if (!source) {
          throw new Error(`devtool source not found`);
        }
        if (!target) {
          throw new Error(`devtool target not found`);
        }
        const url = target.getURL();
        if (url !== "about:blank" && !url.startsWith("devtools://")) {
          throw new Error(`dev url invalid: ${url}`);
        }
        source.setDevToolsWebContents(target);
        log("setDevToolsWebContents done");
        source.openDevTools();
        if (url === "about:blank") {
          // 必须要有延迟，否则无法正确初始化
          setTimeout(() => {
            source.closeDevTools();
            setTimeout(() => {
              source.openDevTools();
            }, 200);
          }, 200);
        }
      } catch (err: any) {
        log("setDevToolsWebContents error: %O", err);
        return { success: false, error: err.message };
      }
      return { success: true };
    }),

    detachDevTools: orpcServer.handler(({ input }) => {
      const { sourceId } = input as { sourceId: number };

      try {
        const source = webContents.fromId(sourceId);
        if (!source) {
          throw new Error(`devtool source not found`);
        }
        if (source.isDevToolsOpened()) {
          source.closeDevTools();
        }
      } catch (err: any) {
        log("closeDevTools error: %O", err);
        return { success: false, error: err.message };
      }
      return { success: true };
    }),
  });
}

export default {
  name: "browser",
  configContributions: (ctx) => ({
    router: createBrowserRouter(ctx.orpcServer),
  }),
} satisfies MainPlugin;
