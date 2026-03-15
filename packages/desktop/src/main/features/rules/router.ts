import { implement } from "@orpc/server";
import debug from "debug";
import { shell } from "electron";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AppContext } from "../../router";

import { rulesContract } from "../../../shared/features/rules/contract";

const log = debug("neovate:rules-router");

const CLAUDE_DIR = join(homedir(), ".claude");
const GLOBAL_CLAUDE_MD = join(CLAUDE_DIR, "CLAUDE.md");

const os = implement({ rules: rulesContract }).$context<AppContext>();

export const rulesRouter = os.rules.router({
  readGlobal: os.rules.readGlobal.handler(async () => {
    log("readGlobal path=%s", GLOBAL_CLAUDE_MD);
    let content = "";
    if (existsSync(GLOBAL_CLAUDE_MD)) {
      content = readFileSync(GLOBAL_CLAUDE_MD, "utf-8");
    }
    return { content, path: GLOBAL_CLAUDE_MD };
  }),

  writeGlobal: os.rules.writeGlobal.handler(async ({ input }) => {
    log("writeGlobal path=%s length=%d", GLOBAL_CLAUDE_MD, input.content.length);
    if (!existsSync(CLAUDE_DIR)) {
      mkdirSync(CLAUDE_DIR, { recursive: true });
    }
    writeFileSync(GLOBAL_CLAUDE_MD, input.content, "utf-8");
    return { success: true };
  }),

  watchGlobal: os.rules.watchGlobal.handler(async () => {
    if (!existsSync(GLOBAL_CLAUDE_MD)) {
      return { mtime: 0 };
    }
    const stats = statSync(GLOBAL_CLAUDE_MD);
    return { mtime: stats.mtimeMs };
  }),

  openFolder: os.rules.openFolder.handler(async () => {
    log("openFolder path=%s", CLAUDE_DIR);
    if (!existsSync(CLAUDE_DIR)) {
      mkdirSync(CLAUDE_DIR, { recursive: true });
    }
    await shell.openPath(CLAUDE_DIR);
    return { success: true };
  }),

  resolveReferences: os.rules.resolveReferences.handler(async ({ input }) => {
    log("resolveReferences count=%d", input.filenames.length);
    const references = input.filenames.map((filename) => {
      const fullPath = join(CLAUDE_DIR, filename);
      if (!existsSync(fullPath)) {
        return { filename, fullPath, exists: false, lineCount: 0, content: "" };
      }
      const content = readFileSync(fullPath, "utf-8");
      const lineCount = content.split("\n").length;
      return { filename, fullPath, exists: true, lineCount, content };
    });
    return { references };
  }),
});
