import type { MainPlugin } from "../../core/plugin/types";
import { createFilesRouter } from "./router";

export default {
  name: "files",
  configContributions: (ctx) => ({ router: createFilesRouter(ctx.orpcServer) }),
} satisfies MainPlugin;
