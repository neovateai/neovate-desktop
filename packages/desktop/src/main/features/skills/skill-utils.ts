import debug from "debug";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const log = debug("neovate:skills:utils");

import type {
  InstallMeta,
  PreviewSkill,
  SkillFrontmatter,
  SkillMeta,
} from "../../../shared/features/skills/types";

const SKILL_FILE = "SKILL.md";
const SKILL_FILE_DISABLED = "SKILL.md.disabled";
const INSTALL_META_FILE = ".neovate-install.json";

/**
 * Parse YAML frontmatter from a SKILL.md file content string.
 * Simple parser — handles key: value pairs without a full YAML library.
 */
export function parseFrontmatter(content: string): {
  frontmatter: SkillFrontmatter;
  description: string;
  body: string;
} {
  const match = content.match(/^---\s*\n([\s\S]*?)---\s*\n?/);
  if (!match) {
    const firstParagraph =
      content
        .split("\n\n")[0]
        ?.replace(/^#\s+.*\n?/, "")
        .trim() ?? "";
    return { frontmatter: {}, description: firstParagraph, body: content };
  }

  const yamlStr = match[1] ?? "";
  const body = content.slice(match[0].length);
  const fm: Record<string, unknown> = {};

  for (const line of yamlStr.split("\n")) {
    const kv = line.match(/^(\S[\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    if (!key) continue;
    const value = rawValue?.trim() ?? "";

    if (value === "true") fm[key] = true;
    else if (value === "false") fm[key] = false;
    else if (/^\[.*\]$/.test(value)) {
      // Simple array: [Read, Grep, Glob]
      fm[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (/^[\w, ]+$/.test(value) && value.includes(",")) {
      // Comma-separated list without brackets
      fm[key] = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      fm[key] = value;
    }
  }

  const frontmatter: SkillFrontmatter = {
    disableModelInvocation: fm["disable-model-invocation"] === true,
    userInvocable: fm["user-invocable"] !== false,
    allowedTools: Array.isArray(fm["allowed-tools"]) ? fm["allowed-tools"] : undefined,
    model: typeof fm.model === "string" ? fm.model : undefined,
    context: fm.context === "fork" ? "fork" : undefined,
    agent: typeof fm.agent === "string" ? fm.agent : undefined,
    argumentHint: typeof fm["argument-hint"] === "string" ? fm["argument-hint"] : undefined,
  };

  const description =
    typeof fm.description === "string"
      ? fm.description
      : (body
          .split("\n\n")[0]
          ?.replace(/^#\s+.*\n?/, "")
          .trim() ?? "");

  return { frontmatter, description, body };
}

/**
 * Scan a directory for skill subdirectories containing SKILL.md or SKILL.md.disabled.
 * Returns PreviewSkill[] for use in previews.
 */
export async function scanSkillDirs(baseDir: string, singleName?: string): Promise<PreviewSkill[]> {
  log("scanSkillDirs", { baseDir, singleName });
  const skills: PreviewSkill[] = [];

  // If singleName provided, check that specific directory
  if (singleName) {
    const skillFile = path.join(baseDir, SKILL_FILE);
    try {
      const content = await readFile(skillFile, "utf-8");
      const { description } = parseFrontmatter(content);
      skills.push({ name: singleName, description, skillPath: singleName });
    } catch {
      // Not a valid skill directory
    }
    return skills;
  }

  let entries: string[];
  try {
    entries = await readdir(baseDir);
  } catch {
    return skills;
  }

  for (const entry of entries) {
    const entryPath = path.join(baseDir, entry);
    try {
      const s = await stat(entryPath);
      if (!s.isDirectory()) continue;

      const skillFile = path.join(entryPath, SKILL_FILE);
      const content = await readFile(skillFile, "utf-8").catch(() => null);
      if (!content) continue;

      const { description } = parseFrontmatter(content);
      skills.push({ name: entry, description, skillPath: entry });
    } catch {
      continue;
    }
  }

  return skills;
}

/**
 * Scan a skills directory and return SkillMeta[] for installed skills.
 */
export async function scanInstalledSkills(
  skillsDir: string,
  scope: "global" | "project",
  projectPath?: string,
): Promise<SkillMeta[]> {
  log("scanInstalledSkills", { skillsDir, scope });
  const skills: SkillMeta[] = [];

  let entries: string[];
  try {
    entries = await readdir(skillsDir);
    log("scanInstalledSkills entries", { skillsDir, count: entries.length, entries });
  } catch (e) {
    log("scanInstalledSkills readdir failed", { skillsDir, error: (e as Error).message });
    return skills;
  }

  for (const entry of entries) {
    const entryPath = path.join(skillsDir, entry);
    try {
      const s = await stat(entryPath);
      if (!s.isDirectory()) continue;

      // Check for SKILL.md (enabled) or SKILL.md.disabled
      const enabledFile = path.join(entryPath, SKILL_FILE);
      const disabledFile = path.join(entryPath, SKILL_FILE_DISABLED);

      let content: string | null = null;
      let enabled = true;

      content = await readFile(enabledFile, "utf-8").catch(() => null);
      if (!content) {
        content = await readFile(disabledFile, "utf-8").catch(() => null);
        enabled = false;
      }

      if (!content) {
        log("scanInstalledSkills skip (no SKILL.md)", { entry });
        continue;
      }

      const { frontmatter, description } = parseFrontmatter(content);

      // Read install metadata if present
      let version: string | undefined;
      let installedFrom: string | undefined;
      try {
        const metaContent = await readFile(path.join(entryPath, INSTALL_META_FILE), "utf-8");
        const meta: InstallMeta = JSON.parse(metaContent);
        version = meta.version;
        installedFrom = meta.installedFrom;
      } catch {
        // No install metadata
      }

      const name =
        typeof (frontmatter as Record<string, unknown>).name === "string"
          ? ((frontmatter as Record<string, unknown>).name as string)
          : entry;

      skills.push({
        name,
        description,
        dirPath: entryPath,
        scope,
        projectPath,
        enabled,
        frontmatter,
        version,
        installedFrom,
      });
    } catch {
      continue;
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
