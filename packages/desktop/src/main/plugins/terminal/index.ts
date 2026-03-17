import debug from "debug";

import type { MainPlugin, PluginContext } from "../../core/plugin/types";

import { PtyManager } from "./pty-manager";
import { createTerminalRouter } from "./router";

const log = debug("neovate:terminal");

let ptyManager: PtyManager | null = null;

export default {
  name: "terminal",
  activate: async () => {
    log("activating");
  },
  async configContributions(ctx: PluginContext) {
    ptyManager = new PtyManager(ctx.shell);
    return {
      router: createTerminalRouter(ctx.orpcServer, ptyManager),
    };
  },
  deactivate: () => ptyManager?.killAll(),
} satisfies MainPlugin;
