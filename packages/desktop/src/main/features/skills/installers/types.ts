import type { PreviewSkill } from "../../../../shared/features/skills/types";

export interface SkillInstaller {
  detect(sourceRef: string): boolean;
  scan(sourceRef: string): Promise<{ previewId: string; skills: PreviewSkill[] }>;
  install(sourceRef: string, skillName: string, targetDir: string): Promise<void>;
  /** Install skills from a preview. Returns installed directory names (relative to targetDir). */
  installFromPreview(previewId: string, skillPaths: string[], targetDir: string): Promise<string[]>;
  cleanup(previewId: string): Promise<void>;
  getLatestVersion?(sourceRef: string): Promise<string | undefined>;
}
