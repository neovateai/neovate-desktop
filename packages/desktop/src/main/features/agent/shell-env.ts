import debug from "debug";
import { spawn } from "node:child_process";

const shellEnvLog = debug("neovate:acp-shell-env");

/** Env vars we care about extracting from the user's interactive shell. */
const RELEVANT_VARS = new Set([
  "PATH",
  "NVM_DIR",
  "NVM_BIN",
  "VOLTA_HOME",
  "FNM_DIR",
  "FNM_MULTISHELL_PATH",
  "BUN_INSTALL",
  "PNPM_HOME",
  "N_PREFIX",
]);

let cached: Record<string, string> | null = null;

/**
 * Extract environment variables from the user's interactive shell.
 *
 * Packaged Electron apps don't source shell config files, so tools like
 * `npx`, `node`, `bun` etc. may not be on PATH. This spawns the user's
 * shell to source its config and extracts the relevant variables.
 *
 * Results are cached for the lifetime of the app.
 */
export async function getShellEnvironment(): Promise<Record<string, string>> {
  if (cached) {
    shellEnvLog("using cached shell environment");
    return cached;
  }

  const t0 = performance.now();
  try {
    const raw = await extractEnvFromShell();
    cached = filterRelevantVars(raw);
  } catch {
    cached = {};
  }

  const elapsed = Math.round(performance.now() - t0);
  shellEnvLog("shell environment resolved in %dms (keys: %o)", elapsed, Object.keys(cached));
  return cached;
}

/** Clear the cached environment (useful for testing). */
export function clearShellEnvironmentCache(): void {
  cached = null;
}

function extractEnvFromShell(): Promise<string> {
  return new Promise((resolve, reject) => {
    const shell = process.platform === "darwin" ? "/bin/zsh" : (process.env.SHELL ?? "/bin/bash");

    const rcFile = shell.endsWith("zsh") ? "~/.zshrc" : "~/.bashrc";

    const child = spawn(shell, ["-c", `source ${rcFile} 2>/dev/null; env`], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });

    let stdout = "";
    child.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.on("close", (code) => {
      if (code === 0 || stdout.length > 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Shell exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

function filterRelevantVars(raw: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx);
    if (RELEVANT_VARS.has(key)) {
      result[key] = line.slice(eqIdx + 1);
    }
  }

  return result;
}
