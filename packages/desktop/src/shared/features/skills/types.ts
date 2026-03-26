export interface SkillFrontmatter {
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  allowedTools?: string[];
  model?: string;
  context?: "fork";
  agent?: string;
  argumentHint?: string;
}

export interface SkillMeta {
  name: string;
  dirName: string;
  description: string;
  dirPath: string;
  scope: "global" | "project";
  projectPath?: string;
  enabled: boolean;
  frontmatter: SkillFrontmatter;
  version?: string;
  installedFrom?: string;
}

export interface RecommendedSkill {
  name: string;
  description: string;
  source: SkillSource;
  sourceRef: string;
  skillName: string;
  version?: string;
  installed: boolean;
}

export type SkillSource = "prebuilt" | "git" | "npm" | "clawhub";

export interface PreviewSkill {
  name: string;
  description: string;
  skillPath: string;
}

export interface SkillUpdate {
  name: string;
  dirName: string;
  scope: "global" | "project";
  projectPath?: string;
  currentVersion?: string;
  latestVersion: string;
  sourceRef: string;
}

export interface InstallMeta {
  installedFrom: string;
  version: string;
  source: SkillSource;
  installedAt: string;
  skillPath?: string;
}
