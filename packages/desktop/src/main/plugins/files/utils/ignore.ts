import debug from "debug";
import fs, { constants } from "fs";
import { exec } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "path";

const log = debug("neovate:files:ignore");

const execAsync = promisify(exec);

// permanent cache: git ignore rules by root path
const gitignoreCache = new Map<string, string[]>();

/**
 * Check and add .gitignore rules from the specified directory
 */
async function checkAndAddGitignore(dir: string, rules: string[]): Promise<void> {
  const gitignorePath = join(dir, ".gitignore");

  try {
    await access(gitignorePath, constants.F_OK);
    const content = await readFile(gitignorePath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        rules.push(trimmed);
      }
    }
  } catch {
    // file doesn't exist or read failed, ignore
  }
}

/**
 * Find and collect all .gitignore files
 * @param rootPath project root directory
 * @returns array of gitignore rules
 */
async function collectGitignoreRules(rootPath: string): Promise<string[]> {
  const rules: string[] = [];

  try {
    // check root directory .gitignore
    await checkAndAddGitignore(rootPath, rules);

    // use git command to get all .gitignore file contents at once
    try {
      // Skip git commands if no .git directory exists (avoids spawning processes for non-git dirs)
      if (!fs.existsSync(join(rootPath, ".git"))) {
        return rules.filter((rule) => rule.trim() !== "");
      }
      const { stdout: isGitRepo } = await execAsync("git rev-parse --git-dir", {
        cwd: rootPath,
        encoding: "utf-8",
      });

      if (isGitRepo.trim()) {
        // use git ls-files to get all .gitignore files
        const { stdout: gitignoreFiles } = await execAsync("git ls-files **/.gitignore", {
          cwd: rootPath,
          encoding: "utf-8",
        });

        for (const file of gitignoreFiles.trim().split("\n")) {
          if (file.trim()) {
            await checkAndAddGitignore(join(rootPath, file.trim()), rules);
          }
        }
      }
    } catch {
      // not a git repo, ignore
    }
  } catch (error) {
    log("failed to collect gitignore rules", { error });
  }

  return rules.filter((rule) => rule.trim() !== "");
}

const EXCLUDE_FILE_TYPE_PATTERN = [
  "**/node_modules",
  "**/node_modules/**",
  "**/dist",
  "**/dist/**",
  "**/.git",
  "**/.git/**",
  "**/.DS_Store",
  "**/Thumbs.db",
];

/**
 * Convert gitignore rules to minimatch-compatible patterns
 */
function convertGitignoreToMinimatch(gitignoreRule: string): string[] {
  if (!gitignoreRule || gitignoreRule.startsWith("#")) {
    return [];
  }

  const isNegated = gitignoreRule.startsWith("!");
  const cleanRule = isNegated ? gitignoreRule.slice(1) : gitignoreRule;

  if (!cleanRule) return [];

  const patterns: string[] = [];

  if (cleanRule.endsWith("/")) {
    const dirName = cleanRule.slice(0, -1);
    patterns.push(`**/${dirName}/**`, `**/${dirName}`);
  } else {
    patterns.push(`**/${cleanRule}`);

    if (!cleanRule.includes(".") && !cleanRule.includes("*") && !cleanRule.includes("?")) {
      patterns.push(`**/${cleanRule}/**`);
    }
  }

  return patterns;
}

/**
 * Get all exclude patterns including gitignore rules
 * @param rootPath project root directory path
 * @returns array of exclude patterns
 */
export async function getExcludePatterns(rootPath: string): Promise<string[]> {
  // check cache
  const cacheKey = rootPath;
  const cached = gitignoreCache.get(cacheKey);

  if (cached) {
    return cached;
  }
  log("computing exclude patterns", { rootPath });

  const gitignorePatterns: string[] = [];

  try {
    // collect git ignore rules from root directory
    const gitRules = await collectGitignoreRules(rootPath);

    // convert gitignore rules
    for (const rule of gitRules) {
      const converted = convertGitignoreToMinimatch(rule);
      gitignorePatterns.push(...converted);
    }
  } catch (error) {
    log("failed to process gitignore rules", { error });
  }

  const allPatterns = [...EXCLUDE_FILE_TYPE_PATTERN, ...gitignorePatterns];
  const uniquePatterns = [...new Set(allPatterns)];
  gitignoreCache.set(cacheKey, uniquePatterns);

  return uniquePatterns;
}
