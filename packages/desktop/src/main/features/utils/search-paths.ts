import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import debug from "debug";
import { getShellEnvironment } from "../agent/shell-env";

const log = debug("neovate:search-paths");
const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

let cachedRgPath: string | null | undefined; // undefined = not yet resolved

async function findRg(): Promise<string | null> {
  if (cachedRgPath !== undefined) return cachedRgPath;

  const shellEnv = await getShellEnvironment();
  const env = { ...process.env, ...shellEnv };

  return new Promise((resolve) => {
    execFile("which", ["rg"], { env }, (err, stdout) => {
      cachedRgPath = err ? null : stdout.trim();
      log("rg lookup: %s", cachedRgPath ?? "not found, using fallback");
      resolve(cachedRgPath);
    });
  });
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

async function fallbackSearch(cwd: string, query: string, maxResults: number): Promise<string[]> {
  const results: string[] = [];
  const lowerQuery = query.toLowerCase();

  async function walk(dir: string) {
    if (results.length > maxResults) return;

    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length > maxResults) return;
      if (EXCLUDED_DIRS.has(entry)) continue;

      const fullPath = join(dir, entry);
      let info;
      try {
        info = await stat(fullPath);
      } catch {
        continue;
      }

      if (info.isDirectory()) {
        await walk(fullPath);
      } else {
        const relPath = relative(cwd, fullPath);
        if (relPath.toLowerCase().includes(lowerQuery)) {
          results.push(relPath);
        }
      }
    }
  }

  await walk(cwd);
  return results;
}

export async function searchPaths(
  cwd: string,
  query: string,
  maxResults = 100,
): Promise<{ paths: string[]; truncated: boolean }> {
  log("searchPaths cwd=%s query=%s maxResults=%d", cwd, query, maxResults);
  const rgPath = await findRg();

  let paths: string[];
  if (rgPath) {
    paths = await rgSearch(rgPath, cwd, query);
  } else {
    paths = await fallbackSearch(cwd, query, maxResults);
  }

  const truncated = paths.length > maxResults;
  if (truncated) paths = paths.slice(0, maxResults);
  paths.sort();

  log("searchPaths result: %d paths, truncated=%s", paths.length, truncated);
  return { paths, truncated };
}
