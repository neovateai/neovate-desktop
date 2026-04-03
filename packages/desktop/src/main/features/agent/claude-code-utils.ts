import { is } from "@electron-toolkit/utils";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";

import { EXE_EXT } from "../../../shared/platform";

const require = createRequire(import.meta.url);

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
 * Resolve the path to the bundled bun binary.
 *
 * In dev mode, uses the system bun from PATH (no bundled binary needed).
 * In production, uses the bun binary bundled via electron-builder extraResources.
 *
 * Using bun instead of Electron-as-Node avoids macOS showing a Dock icon
 * for each SDK subprocess (macOS identifies GUI apps by .app bundle path).
 */
export function resolveBunPath(): string {
  if (is.dev) return `bun${EXE_EXT}`;
  return path.join(process.resourcesPath, "bun", `bun${EXE_EXT}`);
}

/**
 * Resolve the path to the bundled RTK binary.
 *
 * In dev mode, uses the system rtk from PATH (silent no-op if not installed).
 * In production, uses the rtk binary bundled via electron-builder extraResources.
 */
export function resolveRtkPath(): string {
  if (is.dev) return `rtk${EXE_EXT}`;
  return path.join(process.resourcesPath, "rtk", `rtk${EXE_EXT}`);
}

/**
 * Resolve the path to the bundled fetch interceptor script.
 *
 * In dev mode, uses the build output in the project resources directory.
 * In production, uses the file bundled via electron-builder extraResources.
 */
export function resolveInterceptorPath(): string {
  if (is.dev) {
    return path.join(path.dirname(path.dirname(__dirname)), "resources", "fetch-interceptor.js");
  }
  return path.join(process.resourcesPath, "fetch-interceptor.js");
}

/**
 * Check if a file-based RTK PreToolUse hook already exists in ~/.claude/settings.json.
 * Returns true if found, so the programmatic hook can be skipped to avoid double-rewriting.
 */
export type ClaudeCodeExecutableInfo = {
  executable: string;
  cliPath: string | undefined;
  standalone: boolean;
};

export function resolveClaudeCodeExecutable(customPath?: string): ClaudeCodeExecutableInfo {
  const normalized = customPath?.trim().replace(/^~(?=\/|$)/, homedir()) || undefined;

  if (!normalized) {
    return { executable: resolveBunPath(), cliPath: resolveSDKCliPath(), standalone: false };
  }
  if (normalized.endsWith(".js")) {
    return { executable: resolveBunPath(), cliPath: normalized, standalone: false };
  }
  return { executable: normalized, cliPath: undefined, standalone: true };
}

export function detectRtkHookInSettings(): boolean {
  try {
    const settingsPath = path.join(homedir(), ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const preToolUse = settings?.hooks?.PreToolUse;
    if (!Array.isArray(preToolUse)) return false;
    return preToolUse.some(
      (matcher: any) =>
        Array.isArray(matcher?.hooks) &&
        matcher.hooks.some((h: any) => typeof h?.command === "string" && h.command.includes("rtk")),
    );
  } catch {
    return false;
  }
}
