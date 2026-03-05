import type { MainPlugin } from "../../core/plugin/types";
import { PtyManager } from "./pty-manager";
import { createTerminalRouter } from "./router";

const ptyManager = new PtyManager();

export default {
  name: "terminal",
  configContributions: (ctx) => ({
    router: createTerminalRouter(ctx.orpcServer, ptyManager),
  }),
  deactivate: () => ptyManager.killAll(),
} satisfies MainPlugin;
