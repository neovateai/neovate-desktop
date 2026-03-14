import { randomUUID } from "node:crypto";
import { cp } from "node:fs/promises";
import path from "node:path";

import type { PreviewSkill } from "../../../../shared/features/skills/types";
import type { SkillInstaller } from "./types";

import { scanSkillDirs } from "../skill-utils";

export class PrebuiltInstaller implements SkillInstaller {
  private resourcesDir: string;

  constructor(resourcesDir: string) {
    this.resourcesDir = resourcesDir;
  }

  detect(sourceRef: string): boolean {
    return sourceRef.startsWith("prebuilt:");
  }

  async scan(sourceRef: string): Promise<{ previewId: string; skills: PreviewSkill[] }> {
    const skillName = sourceRef.replace("prebuilt:", "");
    const skillDir = path.join(this.resourcesDir, skillName);
    const skills = await scanSkillDirs(skillDir, skillName);
    const previewId = randomUUID();
    return { previewId, skills };
  }

  async install(sourceRef: string, skillName: string, targetDir: string): Promise<void> {
    const name = sourceRef.replace("prebuilt:", "");
    const src = path.join(this.resourcesDir, name);
    const dest = path.join(targetDir, skillName);
    await cp(src, dest, { recursive: true });
  }

  async installFromPreview(
    _previewId: string,
    skillNames: string[],
    targetDir: string,
  ): Promise<void> {
    for (const name of skillNames) {
      const src = path.join(this.resourcesDir, name);
      const dest = path.join(targetDir, name);
      await cp(src, dest, { recursive: true });
    }
  }

  async cleanup(_previewId: string): Promise<void> {
    // Prebuilt skills don't create tmp directories
  }
}
