import debug from "debug";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { PreviewSkill } from "../../../../shared/features/skills/types";
import type { SkillInstaller } from "./types";

import { shellEnvService } from "../../../core/shell-service";
import { deriveInstallName, resolveSkillSource, scanSkillDirs } from "../skill-utils";

const execFileAsync = promisify(execFile);
const log = debug("neovate:skills:git");

export class GitInstaller implements SkillInstaller {
  private previewDirs = new Map<string, { tmpDir: string; sourceRef: string; subpath?: string }>();

  detect(sourceRef: string): boolean {
    if (sourceRef.startsWith("prebuilt:") || sourceRef.startsWith("npm:")) return false;
    // Match git: prefix, URLs with .git, or github/gitlab patterns
    if (sourceRef.startsWith("git:")) return true;
    if (/^https?:\/\//.test(sourceRef)) return true;
    if (/^[\w.-]+\/[\w.-]+$/.test(sourceRef)) return true; // user/repo shorthand
    return false;
  }

  async scan(sourceRef: string): Promise<{ previewId: string; skills: PreviewSkill[] }> {
    log("scan", { sourceRef });
    const env = await shellEnvService.getEnv();
    const { url, branch, subpath } = this.parseSourceRef(sourceRef);
    const previewId = randomUUID();
    const tmpDir = path.join(tmpdir(), `neovate-skill-preview-${previewId}`);

    await this.cloneRepo({ url, branch, subpath, tmpDir, env });

    this.previewDirs.set(previewId, { tmpDir, sourceRef, subpath });
    const scanRoot = subpath ? path.join(tmpDir, subpath) : tmpDir;
    const skills = await scanSkillDirs(scanRoot);
    return { previewId, skills };
  }

  async install(sourceRef: string, skillName: string, targetDir: string): Promise<void> {
    log("install", { sourceRef, skillName, targetDir });
    const env = await shellEnvService.getEnv();
    const { url, branch, subpath } = this.parseSourceRef(sourceRef);
    const tmpId = randomUUID();
    const tmpDir = path.join(tmpdir(), `neovate-skill-preview-${tmpId}`);

    try {
      await this.cloneRepo({ url, branch, subpath, tmpDir, env });
      const baseDir = subpath ? path.join(tmpDir, subpath) : tmpDir;
      const src = resolveSkillSource(baseDir, skillName);
      const destName = deriveInstallName(skillName, sourceRef);
      const dest = path.join(targetDir, destName);
      const filter = (s: string) => path.basename(s) !== ".git";
      await cp(src, dest, { recursive: true, filter });
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async installFromPreview(
    previewId: string,
    skillPaths: string[],
    targetDir: string,
  ): Promise<string[]> {
    log("installFromPreview", { previewId, skillPaths });
    const preview = this.previewDirs.get(previewId);
    if (!preview) throw new Error("Preview not found or expired");

    const installed: string[] = [];
    const filter = (s: string) => path.basename(s) !== ".git";
    const baseDir = preview.subpath ? path.join(preview.tmpDir, preview.subpath) : preview.tmpDir;
    for (const sp of skillPaths) {
      const destName = deriveInstallName(sp, preview.sourceRef);
      const src = resolveSkillSource(baseDir, sp);
      const dest = path.join(targetDir, destName);
      await cp(src, dest, { recursive: true, filter });
      installed.push(destName);
    }

    await this.cleanup(previewId);
    return installed;
  }

  async cleanup(previewId: string): Promise<void> {
    const preview = this.previewDirs.get(previewId);
    if (preview) {
      await rm(preview.tmpDir, { recursive: true, force: true }).catch(() => {});
      this.previewDirs.delete(previewId);
    }
  }

  async getLatestVersion(sourceRef: string): Promise<string | undefined> {
    log("getLatestVersion", { sourceRef });
    try {
      const env = await shellEnvService.getEnv();
      const { url } = this.parseSourceRef(sourceRef);
      const { stdout } = await execFileAsync("git", ["ls-remote", url, "HEAD"], {
        timeout: 15_000,
        env,
      });
      const sha = stdout.split("\t")[0];
      return sha ? sha.slice(0, 7) : undefined;
    } catch {
      return undefined;
    }
  }

  /** Clean up any stale preview directories */
  cleanupStale(): void {
    for (const [id, { tmpDir }] of this.previewDirs) {
      rm(tmpDir, { recursive: true, force: true })
        .then(() => this.previewDirs.delete(id))
        .catch(() => {});
    }
  }

  private parseSourceRef(sourceRef: string): {
    url: string;
    branch?: string;
    subpath?: string;
  } {
    let raw = sourceRef.replace(/^git:/, "");

    // user/repo shorthand → github URL
    if (/^[\w.-]+\/[\w.-]+$/.test(raw)) {
      return { url: `https://github.com/${raw}.git` };
    }

    // GitHub/GitLab/Bitbucket tree URLs: .../tree/<branch>[/<subpath>]
    const treeMatch = raw.match(
      /^(https?:\/\/[^/]+\/[^/]+\/[^/]+?)(?:\.git)?\/tree\/([^/]+)(?:\/(.+))?$/,
    );
    if (treeMatch) {
      const url = `${treeMatch[1]}.git`;
      const branch = treeMatch[2]!;
      const subpath = treeMatch[3]?.replace(/\/+$/, ""); // strip trailing slashes
      return { url, branch, subpath: subpath || undefined };
    }

    return { url: raw };
  }

  private async cloneRepo(opts: {
    url: string;
    branch?: string;
    subpath?: string;
    tmpDir: string;
    env: Record<string, string>;
  }): Promise<void> {
    const { url, branch, subpath, tmpDir, env } = opts;

    if (subpath) {
      // Sparse checkout: only download files under the subpath
      const cloneArgs = ["clone", "--depth", "1", "--filter=blob:none", "--sparse"];
      if (branch) cloneArgs.push("--branch", branch);
      cloneArgs.push(url, tmpDir);
      await execFileAsync("git", cloneArgs, { timeout: 60_000, env });
      await execFileAsync("git", ["-C", tmpDir, "sparse-checkout", "set", subpath], {
        timeout: 30_000,
        env,
      });
    } else {
      const cloneArgs = ["clone", "--depth", "1"];
      if (branch) cloneArgs.push("--branch", branch);
      cloneArgs.push(url, tmpDir);
      await execFileAsync("git", cloneArgs, { timeout: 60_000, env });
    }
  }
}
