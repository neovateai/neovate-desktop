import { spawn, execSync } from "node:child_process";
import { existsSync, statSync, rmSync, unlinkSync } from "node:fs";
import debug from "debug";
import { app } from "electron";
import { implement } from "@orpc/server";
import { utilsContract } from "../../../shared/features/utils/contract";
import type { App } from "../../../shared/features/utils/types";
import type { AppContext } from "../../router";
import { getShellEnvironment } from "../agent/shell-env";
import { searchPaths } from "./search-paths";

const log = debug("neovate:utils-router");

const os = implement({ utils: utilsContract }).$context<AppContext>();

const APP_COMMANDS: Record<App, { cmd: string; args: (cwd: string) => string[] }> = {
  cursor: { cmd: "cursor", args: (cwd) => [cwd] },
  vscode: { cmd: "code", args: (cwd) => [cwd] },
  "vscode-insiders": { cmd: "code-insiders", args: (cwd) => [cwd] },
  zed: { cmd: "zed", args: (cwd) => [cwd] },
  windsurf: { cmd: "windsurf", args: (cwd) => [cwd] },
  antigravity: { cmd: "agy", args: (cwd) => [cwd] },
  iterm: { cmd: "open", args: (cwd) => ["-a", "iTerm", cwd] },
  warp: { cmd: "open", args: (cwd) => ["-a", "Warp", cwd] },
  terminal: { cmd: "open", args: (cwd) => ["-a", "Terminal", cwd] },
  finder: { cmd: "open", args: (cwd) => [cwd] },
  sourcetree: { cmd: "open", args: (cwd) => ["-a", "SourceTree", cwd] },
  fork: { cmd: "open", args: (cwd) => ["-a", "Fork", cwd] },
};

const CLI_APPS: Partial<Record<App, string>> = {
  cursor: "cursor",
  vscode: "code",
  "vscode-insiders": "code-insiders",
  zed: "zed",
  windsurf: "windsurf",
  antigravity: "agy",
};

const MAC_APPS: Partial<Record<App, string>> = {
  iterm: "/Applications/iTerm.app",
  warp: "/Applications/Warp.app",
  terminal: "/System/Applications/Utilities/Terminal.app",
  sourcetree: "/Applications/Sourcetree.app",
  fork: "/Applications/Fork.app",
};

const ALL_APPS: App[] = [
  "cursor",
  "vscode",
  "vscode-insiders",
  "zed",
  "windsurf",
  "antigravity",
  "iterm",
  "warp",
  "terminal",
  "finder",
  "sourcetree",
  "fork",
];

function checkApp(app: App, env: Record<string, string>): boolean {
  if (app === "finder") {
    return process.platform === "darwin";
  }
  const cli = CLI_APPS[app];
  if (cli) {
    try {
      execSync(`which ${cli}`, {
        stdio: "ignore",
        env: { ...process.env, ...env },
      });
      return true;
    } catch {
      return false;
    }
  }
  const macPath = MAC_APPS[app];
  if (macPath) {
    return existsSync(macPath);
  }
  return false;
}

export const utilsRouter = os.utils.router({
  openIn: os.utils.openIn.handler(async ({ input }) => {
    const { cwd, app } = input;
    const config = APP_COMMANDS[app];
    const shellEnv = await getShellEnvironment();
    const child = spawn(config.cmd, config.args(cwd), {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, ...shellEnv },
    });
    child.unref();
    return { success: true };
  }),

  detectApps: os.utils.detectApps.handler(async () => {
    const shellEnv = await getShellEnvironment();
    const apps = ALL_APPS.filter((app) => checkApp(app, shellEnv));
    return { apps };
  }),

  searchPaths: os.utils.searchPaths.handler(async ({ input }) => {
    log("searchPaths request cwd=%s query=%s", input.cwd, input.query);
    return searchPaths(input.cwd, input.query, input.maxResults);
  }),

  setLoginItem: os.utils.setLoginItem.handler(async ({ input }) => {
    const { openAtLogin } = input;
    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden: true,
    });
    return { success: true };
  }),
  removeFile: os.utils.removeFile.handler(async ({ input }) => {
    const { path } = input;
    try {
      if (!path) {
        return { success: false, error: "Path is required" };
      }
      if (!existsSync(path)) {
        return { success: false, error: "File does not exist" };
      }
      const stats = statSync(path);
      if (stats.isDirectory()) {
        rmSync(path, { recursive: true, force: true });
      } else {
        unlinkSync(path);
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }),
});
