import type { MainPlugin } from "../../core/plugin/types";

import { createChangesRouter } from "./router";

export default {
  name: "changes",
  configContributions: (ctx) => ({ router: createChangesRouter(ctx.orpcServer) }),
} satisfies MainPlugin;
