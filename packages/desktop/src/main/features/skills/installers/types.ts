import type { PreviewSkill } from "../../../../shared/features/skills/types";

export interface SkillInstaller {
  detect(sourceRef: string): boolean;
  scan(sourceRef: string): Promise<{ previewId: string; skills: PreviewSkill[] }>;
  install(sourceRef: string, skillName: string, targetDir: string): Promise<void>;
  installFromPreview(previewId: string, skillNames: string[], targetDir: string): Promise<void>;
  cleanup(previewId: string): Promise<void>;
  getLatestVersion?(sourceRef: string): Promise<string | undefined>;
}
