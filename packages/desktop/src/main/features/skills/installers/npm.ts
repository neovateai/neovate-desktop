import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { PreviewSkill } from "../../../../shared/features/skills/types";
import type { SkillInstaller } from "./types";

import { scanSkillDirs } from "../skill-utils";

const execFileAsync = promisify(execFile);

export class NpmInstaller implements SkillInstaller {
  private previewDirs = new Map<string, string>();

  detect(sourceRef: string): boolean {
    if (sourceRef.startsWith("npm:")) return true;
    if (sourceRef.startsWith("@") && sourceRef.includes("/")) return true;
    return false;
  }

  async scan(sourceRef: string): Promise<{ previewId: string; skills: PreviewSkill[] }> {
    const pkg = this.normalizePackage(sourceRef);
    const previewId = randomUUID();
    const tmpDir = path.join(tmpdir(), `neovate-skill-preview-${previewId}`);
    await mkdir(tmpDir, { recursive: true });

    await this.fetchAndExtract(pkg, tmpDir);

    this.previewDirs.set(previewId, tmpDir);
    // npm pack extracts to a "package" subdirectory
    const extractedDir = path.join(tmpDir, "package");
    const skills = await scanSkillDirs(extractedDir);
    return { previewId, skills };
  }

  async install(sourceRef: string, skillName: string, targetDir: string): Promise<void> {
    const pkg = this.normalizePackage(sourceRef);
    const previewId = randomUUID();
    const tmpDir = path.join(tmpdir(), `neovate-skill-preview-${previewId}`);
    await mkdir(tmpDir, { recursive: true });

    try {
      await this.fetchAndExtract(pkg, tmpDir);
      const extractedDir = path.join(tmpDir, "package");
      const src = path.join(extractedDir, skillName);
      const dest = path.join(targetDir, skillName);
      await cp(src, dest, { recursive: true });
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async installFromPreview(
    previewId: string,
    skillNames: string[],
    targetDir: string,
  ): Promise<void> {
    const tmpDir = this.previewDirs.get(previewId);
    if (!tmpDir) throw new Error("Preview not found or expired");

    const extractedDir = path.join(tmpDir, "package");
    for (const name of skillNames) {
      const src = path.join(extractedDir, name);
      const dest = path.join(targetDir, name);
      await cp(src, dest, { recursive: true });
    }

    await this.cleanup(previewId);
  }

  async cleanup(previewId: string): Promise<void> {
    const tmpDir = this.previewDirs.get(previewId);
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      this.previewDirs.delete(previewId);
    }
  }

  async getLatestVersion(sourceRef: string): Promise<string | undefined> {
    try {
      const pkg = this.normalizePackage(sourceRef).replace(/@[\d.]+$/, "");
      const { stdout } = await execFileAsync("npm", ["view", pkg, "version"], {
        timeout: 15_000,
      });
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private normalizePackage(sourceRef: string): string {
    return sourceRef.replace(/^npm:/, "");
  }

  private async fetchAndExtract(pkg: string, destDir: string): Promise<void> {
    // npm pack downloads tarball to cwd
    await execFileAsync("npm", ["pack", pkg, "--pack-destination", destDir], {
      timeout: 60_000,
      cwd: destDir,
    });

    // Find the tarball
    const { stdout } = await execFileAsync("ls", [destDir]);
    const tarball = stdout.split("\n").find((f) => f.endsWith(".tgz"));
    if (!tarball) throw new Error("Failed to download npm package");

    // Extract
    await execFileAsync("tar", ["xzf", path.join(destDir, tarball), "-C", destDir]);
  }
}
