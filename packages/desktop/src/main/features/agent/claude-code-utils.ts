import type { SpawnedProcess, SpawnOptions } from "@anthropic-ai/claude-agent-sdk";

import { is } from "@electron-toolkit/utils";
import child_process from "node:child_process";
import path from "node:path";

/**
 * Resolve the real filesystem path to the SDK's cli.js.
 * Inside an ASAR archive, require.resolve returns a virtual path that
 * child_process.spawn cannot use. Replace "app.asar" with "app.asar.unpacked".
 */
export function resolveSDKCliPath(): string {
  const cliPath = path.join(
    path.dirname(require.resolve("@anthropic-ai/claude-agent-sdk")),
    "cli.js",
  );
  return is.dev ? cliPath : cliPath.replace(/\.asar([\\/])/, ".asar.unpacked$1");
}

/**
 * Create a custom spawn function for Claude Agent SDK.
 *
 * Uses Electron's own binary (`process.execPath`) with `ELECTRON_RUN_AS_NODE=1`
 * as the Node runtime, so there is no dependency on the user having `node` in PATH.
 */
export function createSpawnFunction(): (options: SpawnOptions) => SpawnedProcess {
  return ({ args, cwd, env, signal }: SpawnOptions): SpawnedProcess => {
    const child = child_process.spawn(process.execPath, args, {
      cwd,
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
      signal,
      windowsHide: true,
    });

    if (!child.stdin || !child.stdout) {
      throw new Error("Failed to create process streams");
    }

    return child as unknown as SpawnedProcess;
  };
}
