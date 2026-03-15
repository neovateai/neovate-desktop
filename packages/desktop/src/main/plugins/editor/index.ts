import debug from "debug";

import type { MainPlugin } from "../../core/plugin/types";

import { createEditorRouter } from "./router";
import { CodeServerManager } from "./utils";
import { ExtensionBridgeServer } from "./utils/bridge";

const log = debug("neovate:editor");

const codeServerManager = new CodeServerManager();
const extBridge = new ExtensionBridgeServer();

export default {
  name: "editor",
  configContributions: (ctx) => ({
    router: createEditorRouter(ctx.orpcServer, codeServerManager, extBridge),
  }),
  deactivate: () => {
    log("deactivating editor plugin");
    codeServerManager.stop();
    extBridge.stop();
  },
} satisfies MainPlugin;
