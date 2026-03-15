import debug from "debug";

import type { PluginContext } from "../../core/plugin/types";

import { CodeServerManager, ExtensionBridgeServer } from "./utils";

const log = debug("neovate:editor:router");

export function createEditorRouter(
  orpcServer: PluginContext["orpcServer"],
  codeServer: CodeServerManager,
  extBridge: ExtensionBridgeServer,
) {
  return orpcServer.router({
    start: orpcServer.handler(async () => {
      log("starting code server");
      const d1 = Date.now();
      const instance = await codeServer.start(extBridge, (p) => {
        log("downloading", {
          percent: p.percent,
          downloadedBytes: p.downloadedBytes,
          totalBytes: p.totalBytes,
        });
        if (p.downloadedBytes === p.totalBytes) {
          log("download complete", { elapsed: Date.now() - d1 });
        }
      });
      log("code server started", { url: instance.url });
      return { url: instance.url };
    }),
    connect: orpcServer.handler(() => {
      log("waiting for extension bridge ping");
      return new Promise((resolve) => {
        extBridge.register("ping", async () => {
          log("extension bridge connected");
          resolve({});
        });
      });
    }),
    open: orpcServer.handler(async ({ input }) => {
      log("open file", input);
      const {
        cwd = "",
        filePath = "",
        line,
      } = input as { cwd: string; filePath: string; line: number };
      const res = await extBridge.send(
        { operationType: "editor.open", params: { filePath, line } },
        cwd,
      );
      return res;
    }),
    setTheme: orpcServer.handler(async ({ input }) => {
      log("set theme", input);
      const { cwd = "", theme = "" } = input as { cwd: string; theme: string };
      const res = await extBridge.send(
        { operationType: "editor.theme.set", params: { theme } },
        cwd,
      );
      return res;
    }),
  });
}
