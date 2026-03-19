import debug from "debug";
import { randomUUID } from "node:crypto";
import { cp } from "node:fs/promises";
import path from "node:path";

import type { PreviewSkill } from "../../../../shared/features/skills/types";
import type { SkillInstaller } from "./types";

import { scanSkillDirs } from "../skill-utils";

const log = debug("neovate:skills:prebuilt");

export class PrebuiltInstaller implements SkillInstaller {
  private resourcesDir: string;

  constructor(resourcesDir: string) {
    this.resourcesDir = resourcesDir;
  }

  detect(sourceRef: string): boolean {
    return sourceRef.startsWith("prebuilt:");
  }

  async scan(sourceRef: string): Promise<{ previewId: string; skills: PreviewSkill[] }> {
    log("scan", { sourceRef });
    const skillName = sourceRef.replace("prebuilt:", "");
    const skillDir = path.join(this.resourcesDir, skillName);
    const skills = await scanSkillDirs(skillDir, skillName);
    const previewId = randomUUID();
    return { previewId, skills };
  }

  async install(sourceRef: string, skillName: string, targetDir: string): Promise<void> {
    log("install", { sourceRef, skillName, targetDir });
    const name = sourceRef.replace("prebuilt:", "");
    const src = path.join(this.resourcesDir, name);
    const dest = path.join(targetDir, skillName);
    await cp(src, dest, { recursive: true });
  }

  async installFromPreview(
    _previewId: string,
    skillPaths: string[],
    targetDir: string,
  ): Promise<string[]> {
    log("installFromPreview", { skillPaths });
    const installed: string[] = [];
    for (const name of skillPaths) {
      const src = path.join(this.resourcesDir, name);
      const dest = path.join(targetDir, name);
      await cp(src, dest, { recursive: true });
      installed.push(name);
    }
    return installed;
  }

  async cleanup(_previewId: string): Promise<void> {
    // Prebuilt skills don't create tmp directories
  }
}
