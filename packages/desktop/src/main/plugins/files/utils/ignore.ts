import { constants } from "fs";
import { exec } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "path";

const execAsync = promisify(exec);

// 永久缓存：按根目录路径缓存Git忽略规则
const gitignoreCache = new Map<string, string[]>();

/**
 * 检查并添加指定目录下的.gitignore规则
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
    // 文件不存在或读取失败，忽略错误
  }
}

/**
 * 查找并收集所有.gitignore文件
 * @param rootPath 项目根目录
 * @returns gitignore规则数组
 */
async function collectGitignoreRules(rootPath: string): Promise<string[]> {
  const rules: string[] = [];

  try {
    // 检查根目录的.gitignore
    await checkAndAddGitignore(rootPath, rules);

    // 使用git命令一次性获取所有.gitignore文件内容
    try {
      const { stdout: isGitRepo } = await execAsync("git rev-parse --git-dir", {
        cwd: rootPath,
        encoding: "utf-8",
      });

      if (isGitRepo.trim()) {
        // 使用git ls-files获取所有.gitignore文件
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
      // 不是git仓库，忽略错误
    }
  } catch (error) {
    console.warn("Failed to collect gitignore rules:", error);
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
 * 将gitignore规则转换为minimatch兼容的模式
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
 * 获取所有排除模式，包括gitignore规则
 * @param rootPath 项目根目录路径
 * @returns 排除模式数组
 */
export async function getExcludePatterns(rootPath: string): Promise<string[]> {
  // 检查缓存
  const cacheKey = rootPath;
  const cached = gitignoreCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const gitignorePatterns: string[] = [];

  try {
    // 直接使用根目录收集Git ignore规则
    const gitRules = await collectGitignoreRules(rootPath);

    // 转换gitignore规则
    for (const rule of gitRules) {
      const converted = convertGitignoreToMinimatch(rule);
      gitignorePatterns.push(...converted);
    }
  } catch (error) {
    console.warn("Failed to process gitignore rules:", error);
  }

  const allPatterns = [...EXCLUDE_FILE_TYPE_PATTERN, ...gitignorePatterns];
  const uniquePatterns = [...new Set(allPatterns)];
  gitignoreCache.set(cacheKey, uniquePatterns);

  return uniquePatterns;
}
