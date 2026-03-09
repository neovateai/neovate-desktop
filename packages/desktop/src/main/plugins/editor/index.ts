import type { MainPlugin } from "../../core/plugin/types";

import { createEditorRouter } from "./router";
import { CodeServerManager } from "./utils";
import { ExtensionBridgeServer } from "./utils/bridge";

const codeServerManager = new CodeServerManager();
const extBridge = new ExtensionBridgeServer();

export default {
  name: "editor",
  configContributions: (ctx) => ({
    router: createEditorRouter(ctx.orpcServer, codeServerManager, extBridge),
  }),
  deactivate: () => {
    codeServerManager.stop();
    extBridge.stop();
  },
} satisfies MainPlugin;
