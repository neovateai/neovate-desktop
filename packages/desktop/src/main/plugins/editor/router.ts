import type { PluginContext } from "../../core/plugin/types";
import { CodeServerManager, ExtensionBridgeServer } from "./utils";

export function createEditorRouter(
  orpcServer: PluginContext["orpcServer"],
  codeServer: CodeServerManager,
  extBridge: ExtensionBridgeServer,
) {
  return orpcServer.router({
    start: orpcServer.handler(async () => {
      const d1 = Date.now();
      const instance = await codeServer.start(extBridge, (p) => {
        console.log("[Code server downloading]", p);
        if (p.downloadedBytes === p.totalBytes) {
          console.log("[Code server downloaded, cost]", Date.now() - d1);
        }
      });
      return { url: instance.url };
    }),
    connect: orpcServer.handler(() => {
      return new Promise((resolve) => {
        extBridge.register("ping", async () => {
          resolve({});
        });
      });
    }),
    open: orpcServer.handler(async ({ input }) => {
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
  });
}
