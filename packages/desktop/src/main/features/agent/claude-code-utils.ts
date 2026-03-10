import { is } from "@electron-toolkit/utils";
import { createRequire } from "node:module";
import path from "node:path";

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
  if (is.dev) return "bun";
  return path.join(process.resourcesPath, "bun", "bun");
}
