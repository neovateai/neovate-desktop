import type { MainPlugin } from "../../core/plugin/types";

import { createReviewRouter } from "./router";

export default {
  name: "review",
  configContributions: (ctx) => ({ router: createReviewRouter(ctx.orpcServer) }),
} satisfies MainPlugin;
