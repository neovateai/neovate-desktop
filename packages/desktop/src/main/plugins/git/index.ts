import type { MainPlugin } from "../../core/plugin/types";
import { createGitRouter } from "./router";

export default {
  name: "git",
  configContributions: (ctx) => ({ router: createGitRouter(ctx.orpcServer) }),
} satisfies MainPlugin;
