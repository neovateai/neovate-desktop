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
  name: string | undefined;
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
    return { frontmatter: {}, name: undefined, description: firstParagraph, body: content };
  }

  const yamlStr = match[1] ?? "";
  const body = content.slice(match[0].length);
  const fm: Record<string, unknown> = {};

  const lines = yamlStr.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i]!.match(/^(\S[\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    if (!key) continue;
    const value = rawValue?.trim() ?? "";

    // YAML block scalar: | (literal) or > (folded)
    if (/^[|>][+-]?$/.test(value)) {
      const isFolded = value.startsWith(">");
      const blockLines: string[] = [];
      while (i + 1 < lines.length && /^[ \t]/.test(lines[i + 1]!)) {
        i++;
        blockLines.push(lines[i]!.replace(/^[ \t]{2}/, ""));
      }
      if (isFolded) {
        // Folded: join non-empty lines with space, preserve empty lines as newlines
        const paragraphs = blockLines.join("\n").split(/\n{2,}/);
        fm[key] = paragraphs
          .map((p) => p.replace(/\n/g, " ").trim())
          .join("\n\n")
          .trim();
      } else {
        fm[key] = blockLines.join("\n").trim();
      }
    } else if (value === "" && i + 1 < lines.length && /^[ \t]+- /.test(lines[i + 1]!)) {
      // YAML block sequence: indented "- item" lines
      const items: string[] = [];
      while (i + 1 < lines.length && /^[ \t]+- /.test(lines[i + 1]!)) {
        i++;
        items.push(lines[i]!.replace(/^[ \t]+- /, "").trim());
      }
      fm[key] = items;
    } else if (value === "true") fm[key] = true;
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

  const name = typeof fm.name === "string" ? fm.name : undefined;

  return { frontmatter, name, description, body };
}

/**
 * Scan a directory for skills using a 3-tier strategy:
 *   Tier 1: Root-level SKILL.md (single-skill source)
 *   Tier 2: skills/<name>/SKILL.md (organized multi-skill source)
 *   Tier 3: <name>/SKILL.md at top level (flat multi-skill source)
 *
 * Each tier returns early — a root SKILL.md means the entire source is one skill,
 * even if subdirectories also contain SKILL.md files.
 */
export async function scanSkillDirs(baseDir: string, singleName?: string): Promise<PreviewSkill[]> {
  log("scanSkillDirs", { baseDir, singleName });

  // If singleName provided, check that specific directory
  if (singleName) {
    const skillFile = path.join(baseDir, SKILL_FILE);
    try {
      const content = await readFile(skillFile, "utf-8");
      const { description } = parseFrontmatter(content);
      return [{ name: singleName, description, skillPath: singleName }];
    } catch {
      return [];
    }
  }

  // Tier 1: Root-level SKILL.md
  const rootContent = await readFile(path.join(baseDir, SKILL_FILE), "utf-8").catch(() => null);
  if (rootContent) {
    const { name: fmName, description } = parseFrontmatter(rootContent);
    const name = fmName ?? path.basename(baseDir);
    return [{ name, description, skillPath: "." }];
  }

  // Tier 2: skills/ subdirectory
  try {
    const skillsSubdir = path.join(baseDir, "skills");
    const s = await stat(skillsSubdir);
    if (s.isDirectory()) {
      const skills = await scanSubdirectories(skillsSubdir, "skills");
      if (skills.length > 0) return skills;
    }
  } catch {
    // No skills/ subdirectory
  }

  // Tier 3: Top-level subdirectories (existing behavior)
  return scanSubdirectories(baseDir, "");
}

async function scanSubdirectories(dir: string, prefix: string): Promise<PreviewSkill[]> {
  const skills: PreviewSkill[] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return skills;
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    try {
      const s = await stat(entryPath);
      if (!s.isDirectory()) continue;

      const skillFile = path.join(entryPath, SKILL_FILE);
      const content = await readFile(skillFile, "utf-8").catch(() => null);
      if (!content) continue;

      const { description } = parseFrontmatter(content);
      const skillPath = prefix ? `${prefix}/${entry}` : entry;
      skills.push({ name: entry, description, skillPath });
    } catch {
      continue;
    }
  }

  return skills;
}

/** Resolve the absolute source path for a skill within a base directory. */
export function resolveSkillSource(baseDir: string, skillPath: string): string {
  return skillPath === "." ? baseDir : path.join(baseDir, skillPath);
}

/** Derive the destination folder name for installing a skill. */
export function deriveInstallName(skillPath: string, sourceRef: string): string {
  return skillPath === "." ? extractFolderName(sourceRef) : path.basename(skillPath);
}

/** Extract a folder name from a source URL. */
export function extractFolderName(sourceRef: string): string {
  let normalized = sourceRef;

  // Handle npm sources: npm:@scope/package@1.2.3 -> package
  if (normalized.startsWith("npm:") || normalized.startsWith("@")) {
    normalized = normalized.replace(/^npm:/, "");
    // Strip version suffix: @scope/package@1.2.3 -> @scope/package
    normalized = normalized.replace(/@[\d.]+(-[\w.]+)?$/, "");
    // Strip registry query: @scope/package?registry=... -> @scope/package
    const qIdx = normalized.indexOf("?");
    if (qIdx !== -1) normalized = normalized.slice(0, qIdx);
    const lastSegment = normalized.split("/").filter(Boolean).pop();
    return lastSegment || "skill";
  }

  // Handle git sources
  normalized = normalized
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/^https?:\/\/gitlab\.com\//, "")
    .replace(/^https?:\/\/bitbucket\.org\//, "")
    .replace(/^git:/, "")
    .replace(/^github:/, "")
    .replace(/^gitlab:/, "")
    .replace(/^bitbucket:/, "");

  // Handle GitHub tree URLs: user/repo/tree/branch/subpath -> subpath
  const treeMatchWithPath = normalized.match(/^[^/]+\/[^/]+\/tree\/[^/]+\/(.+)$/);
  if (treeMatchWithPath) {
    normalized = treeMatchWithPath[1]!;
  } else {
    const treeMatchBranchOnly = normalized.match(/^([^/]+)\/([^/]+)\/tree\/[^/]+$/);
    if (treeMatchBranchOnly) {
      normalized = treeMatchBranchOnly[2]!;
    }
  }

  // Strip branch ref: user/repo#branch -> user/repo
  normalized = normalized.replace(/#.*$/, "");
  // Strip .git suffix
  normalized = normalized.replace(/\.git$/, "");
  const lastSegment = normalized.split("/").filter(Boolean).pop();
  return lastSegment || "skill";
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

      const { frontmatter, name: fmName, description } = parseFrontmatter(content);

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

      const name = fmName ?? entry;

      skills.push({
        name,
        dirName: entry,
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
