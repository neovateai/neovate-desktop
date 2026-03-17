import type { MainPlugin, PluginContext } from "../../core/plugin/types";

import { createBrowserRouter } from "./router";

export default {
  name: "browser",
  configContributions: (ctx: PluginContext) => ({
    router: createBrowserRouter(ctx.orpcServer),
  }),
} satisfies MainPlugin;
