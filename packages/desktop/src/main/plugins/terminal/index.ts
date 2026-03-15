import debug from "debug";

import type { MainPlugin, PluginContext } from "../../core/plugin/types";

import { PtyManager } from "./pty-manager";
import { createTerminalRouter } from "./router";
import { ShellEnvService } from "./shell-env-service";

const log = debug("neovate:terminal");

const shellEnvService = new ShellEnvService();
const ptyManager = new PtyManager(shellEnvService);

export default {
  name: "terminal",
  activate: async () => {
    log("activating — pre-warming shell environment cache");
    // Pre-warm shell environment cache during activate
    await shellEnvService.getEnvironment();
    log("shell environment cache ready");
  },
  async configContributions(ctx: PluginContext) {
    return {
      router: createTerminalRouter(ctx.orpcServer, ptyManager),
    };
  },
  deactivate: () => ptyManager.killAll(),
} satisfies MainPlugin;
