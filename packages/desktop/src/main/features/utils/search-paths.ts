import debug from "debug";
import Fuse, { type IFuseOptions } from "fuse.js";
import { execFile } from "node:child_process";
import { accessSync, chmodSync, constants } from "node:fs";
import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, relative, sep } from "node:path";

const log = debug("neovate:search-paths");
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Ripgrep path resolution (still used by search-content.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileEntry = {
  path: string;
  filename: string;
  testPenalty: number;
};

type FileCache = {
  cwd: string;
  entries: FileEntry[];
  fuse: Fuse<FileEntry>;
};

// ---------------------------------------------------------------------------
// Cache (single active cwd)
// ---------------------------------------------------------------------------

let cache: FileCache | null = null;

export function invalidateFileCache(): void {
  cache = null;
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

function execGit(args: string[], cwd: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 5000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      resolve(stdout.trim().split("\n").filter(Boolean));
    });
  });
}

async function gitLsFiles(cwd: string): Promise<string[] | null> {
  const tracked = await execGit(
    ["-c", "core.quotepath=false", "ls-files", "--recurse-submodules"],
    cwd,
  );
  if (tracked === null) return null;

  const untracked = await execGit(
    ["-c", "core.quotepath=false", "ls-files", "--others", "--exclude-standard"],
    cwd,
  );

  const files = [...tracked];
  if (untracked) files.push(...untracked);
  return files;
}

function rgFallback(cwd: string): Promise<string[]> {
  return new Promise((resolve) => {
    const rgPath = resolveRgPath();
    const args = ["--files", "--hidden", "--glob", "!.git/", cwd];

    execFile(rgPath, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) {
        resolve([]);
        return;
      }
      resolve(
        stdout
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((p) => relative(cwd, p)),
      );
    });
  });
}

function extractParentDirs(files: string[]): string[] {
  const dirs = new Set<string>();
  for (const file of files) {
    let dir = dirname(file);
    while (dir !== "." && !dirs.has(dir)) {
      dirs.add(dir);
      dir = dirname(dir);
    }
  }
  return [...dirs].map((d) => d + sep);
}

async function collectFiles(cwd: string): Promise<string[]> {
  const gitFiles = await gitLsFiles(cwd);
  const files = gitFiles ?? (await rgFallback(cwd));
  const dirs = extractParentDirs(files);
  return [...new Set([...files, ...dirs])];
}

// ---------------------------------------------------------------------------
// Fuse.js index
// ---------------------------------------------------------------------------

const FUSE_OPTIONS: IFuseOptions<FileEntry> = {
  includeScore: true,
  threshold: 0.5,
  keys: [
    { name: "path", weight: 1 },
    { name: "filename", weight: 2 },
  ],
};

function buildIndex(fileList: string[]): { entries: FileEntry[]; fuse: Fuse<FileEntry> } {
  const entries = fileList.map((p) => ({
    path: p,
    filename: basename(p),
    testPenalty: p.includes("test") ? 1 : 0,
  }));
  const fuse = new Fuse(entries, FUSE_OPTIONS);
  return { entries, fuse };
}

async function getOrBuildCache(cwd: string): Promise<FileCache> {
  if (cache && cache.cwd === cwd) return cache;

  const start = Date.now();
  const fileList = await collectFiles(cwd);
  const { entries, fuse } = buildIndex(fileList);
  cache = { cwd, entries, fuse };
  log("cache built: %d entries in %dms", entries.length, Date.now() - start);
  return cache;
}

// ---------------------------------------------------------------------------
// Directory listing (readdir-based)
// ---------------------------------------------------------------------------

async function listDirectory(
  cwd: string,
  dirPrefix: string,
  maxResults: number,
): Promise<{ paths: string[]; truncated: boolean }> {
  const target = dirPrefix ? join(cwd, dirPrefix) : cwd;
  const entries = await readdir(target, { withFileTypes: true });
  const paths = entries
    .map((e) => {
      const name = e.isDirectory() ? e.name + sep : e.name;
      return dirPrefix ? dirPrefix + name : name;
    })
    .sort();
  return {
    paths: paths.slice(0, maxResults),
    truncated: paths.length > maxResults,
  };
}

// ---------------------------------------------------------------------------
// Query normalization
// ---------------------------------------------------------------------------

function normalizeQuery(query: string): string {
  if (query.startsWith("./")) return query.slice(2);
  if (query === ".") return "";
  return query;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchPaths(
  cwd: string,
  query: string,
  maxResults = 15,
): Promise<{ paths: string[]; truncated: boolean }> {
  log("searchPaths cwd=%s query=%s maxResults=%d", cwd, query, maxResults);

  const q = normalizeQuery(query);

  // Empty → top-level directory listing
  if (q === "") {
    return listDirectory(cwd, "", maxResults);
  }

  // Trailing "/" → scoped directory listing (drill-down)
  if (q.endsWith(sep)) {
    try {
      return await listDirectory(cwd, q, maxResults);
    } catch {
      return { paths: [], truncated: false };
    }
  }

  const index = await getOrBuildCache(cwd);

  // Path-prefix filtering: narrow search to entries under the directory prefix
  let searchSet = index.entries;
  const lastSep = q.lastIndexOf(sep);
  if (lastSep > 0) {
    const dirPrefix = q.substring(0, lastSep);
    searchSet = searchSet.filter((e) => e.path.substring(0, lastSep).startsWith(dirPrefix));
  }

  // Fuzzy search
  const fuse = searchSet === index.entries ? index.fuse : new Fuse(searchSet, FUSE_OPTIONS);

  const results = fuse.search(q, { limit: maxResults });

  // Sort: by score first, penalize test dirs when scores are close
  results.sort((a, b) => {
    if (a.score === undefined || b.score === undefined) return 0;
    if (Math.abs(a.score - b.score) > 0.05) return a.score - b.score;
    return a.item.testPenalty - b.item.testPenalty;
  });

  const paths = results.map((r) => r.item.path);
  log("searchPaths result: %d paths", paths.length);
  return { paths, truncated: false };
}
