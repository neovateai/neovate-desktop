import debug from "debug";
import { execFile } from "node:child_process";
import { accessSync, chmodSync, constants } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

const log = debug("neovate:search-paths");
const require = createRequire(import.meta.url);

let cachedRgPath: string | undefined;

function ensureExecutable(filePath: string) {
  try {
    accessSync(filePath, constants.X_OK);
  } catch {
    chmodSync(filePath, 0o755);
  }
}

export function resolveRgPath(): string {
  if (cachedRgPath) return cachedRgPath;

  const sdkMain = require.resolve("@anthropic-ai/claude-agent-sdk");
  const sdkDir = join(sdkMain, "..", "vendor", "ripgrep", `${process.arch}-${process.platform}`);
  const binary = process.platform === "win32" ? "rg.exe" : "rg";
  const rgPath = join(sdkDir, binary);

  if (process.platform !== "win32") {
    ensureExecutable(rgPath);
  }

  cachedRgPath = rgPath;
  log("rg resolved: %s", rgPath);
  return rgPath;
}

function rgSearch(rgPath: string, cwd: string, query: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const args = [
      "--files",
      "--iglob",
      `*${query}*`,
      "--glob",
      "!node_modules/**",
      "--glob",
      "!.git/**",
      "--glob",
      "!dist/**",
      "--glob",
      "!build/**",
      cwd,
    ];

    execFile(rgPath, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) {
        // rg exits with code 1 when no matches, which is fine
        if (err.message.includes("exit code 1")) {
          resolve([]);
          return;
        }
        reject(err);
        return;
      }
      const lines = stdout.split("\n").filter(Boolean);
      const relativePaths = lines.map((p) => relative(cwd, p));
      resolve(relativePaths);
    });
  });
}

export async function searchPaths(
  cwd: string,
  query: string,
  maxResults = 100,
): Promise<{ paths: string[]; truncated: boolean }> {
  log("searchPaths cwd=%s query=%s maxResults=%d", cwd, query, maxResults);

  let paths = await rgSearch(resolveRgPath(), cwd, query);

  const truncated = paths.length > maxResults;
  if (truncated) paths = paths.slice(0, maxResults);
  paths.sort();

  log("searchPaths result: %d paths, truncated=%s", paths.length, truncated);
  return { paths, truncated };
}
