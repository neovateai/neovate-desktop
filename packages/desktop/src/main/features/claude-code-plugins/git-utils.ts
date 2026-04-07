import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CLONE_TIMEOUT = 60_000;
const PULL_TIMEOUT = 30_000;

function expandGitUrl(url: string): string {
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    return `https://github.com/${url}.git`;
  }
  return url;
}

function isTransientGitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Exit code 128 = fatal git errors (repo not found, auth, invalid URL) — don't retry
  if (msg.includes("exit code 128")) return false;
  return true;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 2000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0 || !isTransientGitError(err)) throw err;
    await new Promise((r) => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, delayMs);
  }
}

export async function gitClone(url: string, dest: string): Promise<void> {
  const expanded = expandGitUrl(url);
  await withRetry(() =>
    execFileAsync("git", ["clone", "--depth", "1", expanded, dest], {
      timeout: CLONE_TIMEOUT,
    }),
  );
}

export async function gitPull(repoDir: string): Promise<void> {
  await withRetry(() =>
    execFileAsync("git", ["pull", "--ff-only"], {
      cwd: repoDir,
      timeout: PULL_TIMEOUT,
    }),
  );
}

export async function gitGetHeadSha(repoDir: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: repoDir,
    timeout: 10_000,
  });
  return stdout.trim();
}

export async function gitCloneSubdir(
  url: string,
  subdir: string,
  ref: string | undefined,
  dest: string,
): Promise<void> {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "neovate-plugin-"));
  try {
    const expanded = expandGitUrl(url);
    const args = ["clone", "--depth", "1"];
    if (ref) args.push("--branch", ref);
    args.push(expanded, tmpDir);
    await withRetry(() => execFileAsync("git", args, { timeout: CLONE_TIMEOUT }));
    const srcDir = path.join(tmpDir, subdir);
    await cp(srcDir, dest, { recursive: true });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
