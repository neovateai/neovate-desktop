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

  searchPaths: oc
    .input(
      z.object({
        cwd: z.string(),
        query: z.string(),
        maxResults: z.number().optional(),
      }),
    )
    .output(type<{ paths: string[]; truncated: boolean }>()),

  setLoginItem: oc
    .input(z.object({ openAtLogin: z.boolean() }))
    .output(type<{ success: boolean }>()),
  removeFile: oc
    .input(z.object({ path: z.string() }))
    .output(type<{ success: boolean; error?: string }>()),

  searchWithContent: oc
    .input(
      z.object({
        cwd: z.string(),
        query: z.string(),
        caseSensitive: z.boolean().optional(),
        exactMatch: z.boolean().optional(),
        maxResults: z.number().optional(),
      }),
    )
    .output(
      type<{
        results: Array<{
          fullPath: string;
          relPath: string;
          fileName: string;
          extName: string;
          matches?: Array<{ line: number; column: number; text: string }>;
        }>;
      }>(),
    ),
};
