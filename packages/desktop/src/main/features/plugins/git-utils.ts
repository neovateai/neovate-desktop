import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CLONE_TIMEOUT = 60_000;
const PULL_TIMEOUT = 30_000;

export async function gitClone(url: string, dest: string): Promise<void> {
  await execFileAsync("git", ["clone", "--depth", "1", url, dest], {
    timeout: CLONE_TIMEOUT,
  });
}

export async function gitPull(repoDir: string): Promise<void> {
  await execFileAsync("git", ["pull", "--ff-only"], {
    cwd: repoDir,
    timeout: PULL_TIMEOUT,
  });
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
    const args = ["clone", "--depth", "1"];
    if (ref) args.push("--branch", ref);
    args.push(url, tmpDir);
    await execFileAsync("git", args, { timeout: CLONE_TIMEOUT });
    const srcDir = path.join(tmpDir, subdir);
    await cp(srcDir, dest, { recursive: true });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
