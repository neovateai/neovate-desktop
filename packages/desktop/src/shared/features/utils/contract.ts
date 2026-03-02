import { oc, type } from "@orpc/contract";
import { z } from "zod";
import type { App } from "./types";

const appSchema = z.enum([
  "cursor",
  "vscode",
  "vscode-insiders",
  "zed",
  "windsurf",
  "iterm",
  "warp",
  "terminal",
  "antigravity",
  "finder",
  "sourcetree",
  "fork",
]);

export const utilsContract = {
  openIn: oc
    .input(z.object({ cwd: z.string(), app: appSchema }))
    .output(type<{ success: boolean }>()),

  detectApps: oc.output(type<{ apps: App[] }>()),
};
