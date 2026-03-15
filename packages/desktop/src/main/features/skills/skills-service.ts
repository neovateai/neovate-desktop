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

import { GitInstaller } from "./installers/git";
import { NpmInstaller } from "./installers/npm";
import { PrebuiltInstaller } from "./installers/prebuilt";
import { scanInstalledSkills } from "./skill-utils";

const GLOBAL_SKILLS_DIR = path.join(homedir(), ".claude", "skills");
const INSTALL_META_FILE = ".neovate-install.json";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const remoteSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(["prebuilt", "git", "npm"]),
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

  constructor(projectStore: ProjectStore, configStore: ConfigStore, resourcesDir: string) {
    this.projectStore = projectStore;
    this.configStore = configStore;
    this.installers = [
      new PrebuiltInstaller(path.join(resourcesDir, "skills")),
      new NpmInstaller(),
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
    name: string,
    scope: "global" | "project",
    projectPath?: string,
  ): Promise<string> {
    const skillDir = this.resolveSkillDir(name, scope, projectPath);
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
    const installed = await this.list("all");
    const installedNames = new Set(installed.map((s) => s.name));

    return registry.map((skill) => ({
      ...skill,
      installed: installedNames.has(skill.skillName),
    }));
  }

  async preview(source: string): Promise<{ previewId: string; skills: PreviewSkill[] }> {
    log("preview", { source });
    const installer = this.findInstaller(source);
    if (!installer) throw new Error(`No installer found for source: ${source}`);
    return installer.scan(source);
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
    await this.writeInstallMeta(path.join(targetDir, skillName), sourceRef);
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

    for (const installer of this.installers) {
      try {
        await installer.installFromPreview(previewId, selectedSkills, targetDir);
        return;
      } catch {
        continue;
      }
    }
    throw new Error("Preview not found or expired");
  }

  async remove(name: string, scope: "global" | "project", projectPath?: string): Promise<void> {
    log("remove", { name, scope, projectPath });
    const skillDir = this.resolveSkillDir(name, scope, projectPath);
    await rm(skillDir, { recursive: true, force: true });
  }

  async enable(name: string, scope: "global" | "project", projectPath?: string): Promise<void> {
    log("enable", { name, scope, projectPath });
    const skillDir = this.resolveSkillDir(name, scope, projectPath);
    await rename(path.join(skillDir, "SKILL.md.disabled"), path.join(skillDir, "SKILL.md"));
  }

  async disable(name: string, scope: "global" | "project", projectPath?: string): Promise<void> {
    log("disable", { name, scope, projectPath });
    const skillDir = this.resolveSkillDir(name, scope, projectPath);
    await rename(path.join(skillDir, "SKILL.md"), path.join(skillDir, "SKILL.md.disabled"));
  }

  async exists(name: string, scope: "global" | "project", projectPath?: string): Promise<boolean> {
    const skillDir = this.resolveSkillDir(name, scope, projectPath);
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

  async update(name: string, scope: "global" | "project", projectPath?: string): Promise<void> {
    log("update", { name, scope, projectPath });
    const skillDir = this.resolveSkillDir(name, scope, projectPath);

    const metaPath = path.join(skillDir, INSTALL_META_FILE);
    const metaContent = await readFile(metaPath, "utf-8");
    const meta: InstallMeta = JSON.parse(metaContent);

    const targetDir = this.resolveSkillsDir(scope, projectPath);
    await rm(skillDir, { recursive: true, force: true });

    const installer = this.findInstaller(meta.installedFrom);
    if (!installer) throw new Error(`No installer found for source: ${meta.installedFrom}`);

    await installer.install(meta.installedFrom, name, targetDir);
    await this.writeInstallMeta(path.join(targetDir, name), meta.installedFrom);
  }

  // --- Registry fetching ---

  private async fetchRegistry(): Promise<Omit<RecommendedSkill, "installed">[]> {
    if (this.registryCache && Date.now() - this.registryCache.fetchedAt < CACHE_TTL_MS) {
      log("fetchRegistry cache hit");
      return this.registryCache.data;
    }

    const urls = this.configStore.get("skillsRegistryUrls");
    log("fetchRegistry fetching", { urlCount: urls?.length ?? 0 });
    if (!urls || urls.length === 0) return [];

    const results = await Promise.allSettled(urls.map((url) => this.fetchSingleRegistry(url)));

    // If ALL fetches failed, propagate error
    const allFailed = results.every((r) => r.status === "rejected");
    if (allFailed) {
      const firstError = results[0] as PromiseRejectedResult;
      throw new Error(
        `Failed to fetch skills registry: ${firstError.reason?.message ?? "unknown error"}`,
      );
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

  private async writeInstallMeta(skillDir: string, sourceRef: string): Promise<void> {
    let source: SkillSource = "git";
    if (sourceRef.startsWith("prebuilt:")) source = "prebuilt";
    else if (sourceRef.startsWith("npm:") || sourceRef.startsWith("@")) source = "npm";

    const installer = this.findInstaller(sourceRef);
    const version = (await installer?.getLatestVersion?.(sourceRef)) ?? "unknown";

    const meta: InstallMeta = {
      installedFrom: sourceRef,
      version,
      source,
      installedAt: new Date().toISOString(),
    };

    await writeFile(path.join(skillDir, INSTALL_META_FILE), JSON.stringify(meta, null, 2));
  }
}
