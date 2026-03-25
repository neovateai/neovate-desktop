import debug from "debug";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";

const log = debug("neovate:skills");

import type {
  InstallMeta,
  PreviewSkill,
  RecommendedSkill,
  SkillMeta,
  SkillSource,
  SkillUpdate,
} from "../../../shared/features/skills/types";
import type { ConfigStore } from "../config/config-store";
import type { ProjectStore } from "../project/project-store";
import type { SkillInstaller } from "./installers/types";

import { ClawhubInstaller } from "./installers/clawhub";
import { GitInstaller } from "./installers/git";
import { NpmInstaller } from "./installers/npm";
import { PrebuiltInstaller } from "./installers/prebuilt";
import { deriveInstallName, scanInstalledSkills } from "./skill-utils";

const GLOBAL_SKILLS_DIR = path.join(homedir(), ".claude", "skills");
const INSTALL_META_FILE = ".neovate-install.json";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const remoteSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(["prebuilt", "git", "npm", "clawhub"]),
  sourceRef: z.string(),
  skillName: z.string(),
  version: z.string().optional(),
});

export class SkillsService {
  private installers: SkillInstaller[];
  private projectStore: ProjectStore;
  private configStore: ConfigStore;
  private registryCache: {
    data: Omit<RecommendedSkill, "installed">[];
    fetchedAt: number;
  } | null = null;
  private previewSources = new Map<string, string>();

  constructor(projectStore: ProjectStore, configStore: ConfigStore, resourcesDir: string) {
    this.projectStore = projectStore;
    this.configStore = configStore;
    this.installers = [
      new PrebuiltInstaller(path.join(resourcesDir, "skills")),
      new NpmInstaller(),
      new ClawhubInstaller(),
      new GitInstaller(),
    ];
  }

  async list(scope: "all" | "global" | "project", projectPath?: string): Promise<SkillMeta[]> {
    log("list", { scope, projectPath });
    const results: SkillMeta[] = [];

    if (scope === "all" || scope === "global") {
      const globalSkills = await scanInstalledSkills(GLOBAL_SKILLS_DIR, "global");
      results.push(...globalSkills);
    }

    if (scope === "all") {
      const projects = this.projectStore.getAll();
      for (const project of projects) {
        const projectSkillsDir = path.join(project.path, ".claude", "skills");
        const projectSkills = await scanInstalledSkills(projectSkillsDir, "project", project.path);
        results.push(...projectSkills);
      }
    } else if (scope === "project" && projectPath) {
      this.validateProjectPath(projectPath);
      const projectSkillsDir = path.join(projectPath, ".claude", "skills");
      const projectSkills = await scanInstalledSkills(projectSkillsDir, "project", projectPath);
      results.push(...projectSkills);
    }

    return results;
  }

  async getContent(
    dirName: string,
    scope: "global" | "project",
    projectPath?: string,
  ): Promise<string> {
    const skillDir = this.resolveSkillDir(dirName, scope, projectPath);
    try {
      return await readFile(path.join(skillDir, "SKILL.md"), "utf-8");
    } catch {
      return await readFile(path.join(skillDir, "SKILL.md.disabled"), "utf-8");
    }
  }

  async recommended(forceRefresh?: boolean): Promise<RecommendedSkill[]> {
    log("recommended", { forceRefresh });
    if (forceRefresh) this.registryCache = null;

    const registry = await this.fetchRegistry();
    log("recommended: registry returned %d items", registry.length);
    const installed = await this.list("all");
    const installedDirNames = new Set(installed.map((s) => s.dirName));

    const result = registry.map((skill) => ({
      ...skill,
      installed: installedDirNames.has(skill.skillName),
    }));
    log("recommended: returning %d items", result.length);
    return result;
  }

  async preview(source: string): Promise<{ previewId: string; skills: PreviewSkill[] }> {
    log("preview", { source });
    const installer = this.findInstaller(source);
    if (!installer) throw new Error(`No installer found for source: ${source}`);
    const result = await installer.scan(source);
    this.previewSources.set(result.previewId, source);
    return result;
  }

  async install(
    sourceRef: string,
    skillName: string,
    scope: "global" | "project",
    projectPath?: string,
  ): Promise<void> {
    log("install", { sourceRef, skillName, scope, projectPath });
    const targetDir = this.resolveSkillsDir(scope, projectPath);
    await mkdir(targetDir, { recursive: true });

    const installer = this.findInstaller(sourceRef);
    if (!installer) throw new Error(`No installer found for source: ${sourceRef}`);

    await installer.install(sourceRef, skillName, targetDir);
    const installedName = deriveInstallName(skillName, sourceRef);
    await this.writeInstallMeta(path.join(targetDir, installedName), sourceRef, skillName);
  }

  async installFromPreview(
    previewId: string,
    selectedSkills: string[],
    scope: "global" | "project",
    projectPath?: string,
  ): Promise<void> {
    log("installFromPreview", { previewId, selectedSkills, scope, projectPath });
    const targetDir = this.resolveSkillsDir(scope, projectPath);
    await mkdir(targetDir, { recursive: true });

    const sourceRef = this.previewSources.get(previewId);

    for (const installer of this.installers) {
      try {
        const installedNames = await installer.installFromPreview(
          previewId,
          selectedSkills,
          targetDir,
        );
        if (sourceRef) {
          for (let i = 0; i < installedNames.length; i++) {
            const name = installedNames[i]!;
            const skillPath = selectedSkills[i];
            await this.writeInstallMeta(path.join(targetDir, name), sourceRef, skillPath);
          }
        }
        this.previewSources.delete(previewId);
        return;
      } catch {
        continue;
      }
    }
    this.previewSources.delete(previewId);
    throw new Error("Preview not found or expired");
  }

  async remove(dirName: string, scope: "global" | "project", projectPath?: string): Promise<void> {
    log("remove", { dirName, scope, projectPath });
    const skillDir = this.resolveSkillDir(dirName, scope, projectPath);
    await rm(skillDir, { recursive: true, force: true });
  }

  async enable(dirName: string, scope: "global" | "project", projectPath?: string): Promise<void> {
    log("enable", { dirName, scope, projectPath });
    const skillDir = this.resolveSkillDir(dirName, scope, projectPath);
    const enabledPath = path.join(skillDir, "SKILL.md");
    const disabledPath = path.join(skillDir, "SKILL.md.disabled");
    try {
      await readFile(enabledPath, "utf-8");
      return; // Already enabled
    } catch {
      await rename(disabledPath, enabledPath);
    }
  }

  async disable(dirName: string, scope: "global" | "project", projectPath?: string): Promise<void> {
    log("disable", { dirName, scope, projectPath });
    const skillDir = this.resolveSkillDir(dirName, scope, projectPath);
    const enabledPath = path.join(skillDir, "SKILL.md");
    const disabledPath = path.join(skillDir, "SKILL.md.disabled");
    try {
      await readFile(disabledPath, "utf-8");
      return; // Already disabled
    } catch {
      await rename(enabledPath, disabledPath);
    }
  }

  async exists(
    dirName: string,
    scope: "global" | "project",
    projectPath?: string,
  ): Promise<boolean> {
    const skillDir = this.resolveSkillDir(dirName, scope, projectPath);
    try {
      await readFile(path.join(skillDir, "SKILL.md"), "utf-8");
      return true;
    } catch {
      try {
        await readFile(path.join(skillDir, "SKILL.md.disabled"), "utf-8");
        return true;
      } catch {
        return false;
      }
    }
  }

  async cancelPreview(previewId: string): Promise<void> {
    for (const installer of this.installers) {
      await installer.cleanup(previewId);
    }
    this.previewSources.delete(previewId);
  }

  async checkUpdates(
    scope: "all" | "global" | "project",
    projectPath?: string,
  ): Promise<SkillUpdate[]> {
    log("checkUpdates", { scope, projectPath });
    const installed = await this.list(scope, projectPath);
    const updates: SkillUpdate[] = [];

    for (const skill of installed) {
      if (!skill.installedFrom || !skill.version) continue;

      const installer = this.findInstaller(skill.installedFrom);
      if (!installer?.getLatestVersion) continue;

      const latest = await installer.getLatestVersion(skill.installedFrom);
      if (latest && latest !== skill.version) {
        updates.push({
          name: skill.name,
          dirName: skill.dirName,
          scope: skill.scope,
          projectPath: skill.projectPath,
          currentVersion: skill.version,
          latestVersion: latest,
          sourceRef: skill.installedFrom,
        });
      }
    }

    return updates;
  }

  async update(dirName: string, scope: "global" | "project", projectPath?: string): Promise<void> {
    log("update", { dirName, scope, projectPath });
    const skillDir = this.resolveSkillDir(dirName, scope, projectPath);

    const metaPath = path.join(skillDir, INSTALL_META_FILE);
    const metaContent = await readFile(metaPath, "utf-8");
    const meta: InstallMeta = JSON.parse(metaContent);

    const installer = this.findInstaller(meta.installedFrom);
    if (!installer) throw new Error(`No installer found for source: ${meta.installedFrom}`);

    // Check if skill was disabled before update
    const wasDisabled = !(await readFile(path.join(skillDir, "SKILL.md"), "utf-8").catch(
      () => null,
    ));

    // Backup old skill instead of deleting — restore on failure
    const backupDir = `${skillDir}.update-backup`;
    await rm(backupDir, { recursive: true, force: true }).catch(() => {});
    await rename(skillDir, backupDir);

    const targetDir = this.resolveSkillsDir(scope, projectPath);
    const skillPath = meta.skillPath ?? dirName;

    try {
      await installer.install(meta.installedFrom, skillPath, targetDir);

      // The installer may install to a different dir name than dirName
      const actualName = deriveInstallName(skillPath, meta.installedFrom);
      if (actualName !== dirName) {
        const actualDir = path.join(targetDir, actualName);
        await rename(actualDir, skillDir);
      }

      await this.writeInstallMeta(skillDir, meta.installedFrom, skillPath);

      // Preserve disabled state
      if (wasDisabled) {
        const enabledPath = path.join(skillDir, "SKILL.md");
        const disabledPath = path.join(skillDir, "SKILL.md.disabled");
        await rename(enabledPath, disabledPath).catch(() => {});
      }

      // Success — remove backup
      await rm(backupDir, { recursive: true, force: true });
    } catch (e) {
      // Restore from backup
      await rm(skillDir, { recursive: true, force: true }).catch(() => {});
      await rename(backupDir, skillDir);
      throw e;
    }
  }

  // --- Registry fetching ---

  private async fetchRegistry(): Promise<Omit<RecommendedSkill, "installed">[]> {
    if (this.registryCache && Date.now() - this.registryCache.fetchedAt < CACHE_TTL_MS) {
      log("fetchRegistry cache hit");
      return this.registryCache.data;
    }

    const urls = this.configStore.get("skillsRegistryUrls");
    log("fetchRegistry urls=%o", urls);
    if (!urls || urls.length === 0) {
      log("fetchRegistry: no registry URLs configured, returning empty");
      return [];
    }

    const results = await Promise.allSettled(urls.map((url) => this.fetchSingleRegistry(url)));

    // If ALL fetches failed, propagate error with details
    const allFailed = results.every((r) => r.status === "rejected");
    if (allFailed) {
      const errors = results.map((r, i) => {
        const reason = (r as PromiseRejectedResult).reason;
        return `${urls[i]}: ${reason?.message ?? "unknown"}`;
      });
      log("fetchRegistry all failed", { errors });
      throw new Error(`Failed to fetch skills registry: ${errors.join("; ")}`);
    }

    // Merge successful results, dedupe by skillName
    const seen = new Set<string>();
    const merged: Omit<RecommendedSkill, "installed">[] = [];
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const skill of result.value) {
        if (seen.has(skill.skillName)) continue;
        seen.add(skill.skillName);
        merged.push(skill);
      }
    }

    this.registryCache = { data: merged, fetchedAt: Date.now() };
    return merged;
  }

  private async fetchSingleRegistry(url: string): Promise<Omit<RecommendedSkill, "installed">[]> {
    log("fetchSingleRegistry", { url });
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Invalid registry format: expected array");

    return data.filter((item) => remoteSkillSchema.safeParse(item).success);
  }

  // --- Private helpers ---

  private resolveSkillsDir(scope: "global" | "project", projectPath?: string): string {
    if (scope === "global") return GLOBAL_SKILLS_DIR;
    if (!projectPath) throw new Error("projectPath required for project scope");
    this.validateProjectPath(projectPath);
    return path.join(projectPath, ".claude", "skills");
  }

  private resolveSkillDir(name: string, scope: "global" | "project", projectPath?: string): string {
    return path.join(this.resolveSkillsDir(scope, projectPath), name);
  }

  private validateProjectPath(projectPath: string): void {
    const projects = this.projectStore.getAll();
    if (!projects.some((p) => p.path === projectPath)) {
      throw new Error(`Unknown project path: ${projectPath}`);
    }
  }

  private findInstaller(sourceRef: string): SkillInstaller | undefined {
    return this.installers.find((i) => i.detect(sourceRef));
  }

  private async writeInstallMeta(
    skillDir: string,
    sourceRef: string,
    skillPath?: string,
  ): Promise<void> {
    let source: SkillSource = "git";
    let normalizedRef = sourceRef;
    if (sourceRef.startsWith("prebuilt:")) source = "prebuilt";
    else if (sourceRef.startsWith("npm:") || sourceRef.startsWith("@")) source = "npm";
    else if (sourceRef.startsWith("clawhub:") || sourceRef.startsWith("https://clawhub.ai/")) {
      source = "clawhub";
      const installer = this.findInstaller(sourceRef) as ClawhubInstaller;
      normalizedRef = installer.normalize(sourceRef);
    }

    const installer = this.findInstaller(normalizedRef);
    const version = (await installer?.getLatestVersion?.(normalizedRef)) ?? "unknown";

    const meta: InstallMeta = {
      installedFrom: normalizedRef,
      version,
      source,
      installedAt: new Date().toISOString(),
      skillPath,
    };

    await writeFile(path.join(skillDir, INSTALL_META_FILE), JSON.stringify(meta, null, 2));
  }
}
