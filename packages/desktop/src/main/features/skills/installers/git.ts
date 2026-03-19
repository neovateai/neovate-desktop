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
  private previewDirs = new Map<string, { tmpDir: string; sourceRef: string }>();

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
    const url = this.normalizeUrl(sourceRef);
    const previewId = randomUUID();
    const tmpDir = path.join(tmpdir(), `neovate-skill-preview-${previewId}`);

    await execFileAsync("git", ["clone", "--depth", "1", url, tmpDir], {
      timeout: 60_000,
      env,
    });

    this.previewDirs.set(previewId, { tmpDir, sourceRef });
    const skills = await scanSkillDirs(tmpDir);
    return { previewId, skills };
  }

  async install(sourceRef: string, skillName: string, targetDir: string): Promise<void> {
    log("install", { sourceRef, skillName, targetDir });
    const env = await shellEnvService.getEnv();
    const url = this.normalizeUrl(sourceRef);
    const tmpId = randomUUID();
    const tmpDir = path.join(tmpdir(), `neovate-skill-preview-${tmpId}`);

    try {
      await execFileAsync("git", ["clone", "--depth", "1", url, tmpDir], {
        timeout: 60_000,
        env,
      });
      const src = resolveSkillSource(tmpDir, skillName);
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
    for (const sp of skillPaths) {
      const destName = deriveInstallName(sp, preview.sourceRef);
      const src = resolveSkillSource(preview.tmpDir, sp);
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
      const url = this.normalizeUrl(sourceRef);
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

  private normalizeUrl(sourceRef: string): string {
    let url = sourceRef.replace(/^git:/, "");
    // user/repo shorthand → github URL
    if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
      url = `https://github.com/${url}.git`;
    }
    return url;
  }
}
