import AdmZip from "adm-zip";
import debug from "debug";
import { randomUUID } from "node:crypto";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { PreviewSkill } from "../../../../shared/features/skills/types";
import type { SkillInstaller } from "./types";

import { deriveInstallName, resolveSkillSource, scanSkillDirs } from "../skill-utils";

const log = debug("neovate:skills:clawhub");

const CLAWHUB_BASE = "https://clawhub.ai";
const DOWNLOAD_TIMEOUT_MS = 60_000;
const METADATA_TIMEOUT_MS = 10_000;

interface ParsedRef {
  slug: string;
  version?: string;
}

export class ClawhubInstaller implements SkillInstaller {
  private previewDirs = new Map<string, { tmpDir: string; sourceRef: string }>();

  detect(sourceRef: string): boolean {
    return sourceRef.startsWith(`${CLAWHUB_BASE}/`) || sourceRef.startsWith("clawhub:");
  }

  /** Normalize any accepted input to canonical `clawhub:{slug}` format. */
  normalize(sourceRef: string): string {
    const { slug } = this.parseRef(sourceRef);
    return `clawhub:${slug}`;
  }

  async scan(sourceRef: string): Promise<{ previewId: string; skills: PreviewSkill[] }> {
    const parsed = this.parseRef(sourceRef);
    log("scan", parsed);

    const previewId = randomUUID();
    const tmpDir = path.join(tmpdir(), `neovate-skill-preview-${previewId}`);
    await mkdir(tmpDir, { recursive: true });

    await this.downloadAndExtract(parsed, tmpDir);

    this.previewDirs.set(previewId, { tmpDir, sourceRef });
    const skills = await scanSkillDirs(tmpDir);

    // Replace temp-dir-based names with the slug for root-level skills
    const tmpDirName = path.basename(tmpDir);
    for (const skill of skills) {
      if (skill.skillPath === "." && skill.name === tmpDirName) {
        skill.name = parsed.slug;
      }
    }

    return { previewId, skills };
  }

  async install(sourceRef: string, skillName: string, targetDir: string): Promise<void> {
    const parsed = this.parseRef(sourceRef);
    log("install", { ...parsed, skillName, targetDir });

    const tmpId = randomUUID();
    const tmpDir = path.join(tmpdir(), `neovate-skill-preview-${tmpId}`);
    await mkdir(tmpDir, { recursive: true });

    try {
      await this.downloadAndExtract(parsed, tmpDir);
      const src = resolveSkillSource(tmpDir, skillName);
      const destName = deriveInstallName(skillName, sourceRef);
      const dest = path.join(targetDir, destName);
      await cp(src, dest, { recursive: true });
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async installFromPreview(
    previewId: string,
    skillPaths: string[],
    targetDir: string,
  ): Promise<string[]> {
    log("installFromPreview", { previewId, skillPaths });
    const preview = this.previewDirs.get(previewId);
    if (!preview) throw new Error("Preview not found or expired");

    const installed: string[] = [];
    for (const sp of skillPaths) {
      const destName = deriveInstallName(sp, preview.sourceRef);
      const src = resolveSkillSource(preview.tmpDir, sp);
      const dest = path.join(targetDir, destName);
      await cp(src, dest, { recursive: true });
      installed.push(destName);
    }

    await this.cleanup(previewId);
    return installed;
  }

  async cleanup(previewId: string): Promise<void> {
    const preview = this.previewDirs.get(previewId);
    if (preview) {
      await rm(preview.tmpDir, { recursive: true, force: true }).catch(() => {});
      this.previewDirs.delete(previewId);
    }
  }

  async getLatestVersion(sourceRef: string): Promise<string | undefined> {
    const { slug } = this.parseRef(sourceRef);
    log("getLatestVersion", { slug });
    try {
      const res = await fetch(`${CLAWHUB_BASE}/api/v1/skills/${slug}`, {
        signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      });
      if (!res.ok) return undefined;
      const data = await res.json();
      return data?.latestVersion?.version ?? undefined;
    } catch {
      return undefined;
    }
  }

  private parseRef(sourceRef: string): ParsedRef {
    // clawhub:slug or clawhub:slug@version
    if (sourceRef.startsWith("clawhub:")) {
      const raw = sourceRef.slice("clawhub:".length);
      const atIdx = raw.indexOf("@");
      if (atIdx !== -1) {
        return { slug: raw.slice(0, atIdx), version: raw.slice(atIdx + 1) };
      }
      return { slug: raw };
    }

    // https://clawhub.ai/owner/slug[?version=...]
    const url = new URL(sourceRef);
    const segments = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (segments.length < 2) {
      throw new Error(`Invalid ClawHub URL: expected https://clawhub.ai/{owner}/{slug}`);
    }
    const slug = segments[1]!;
    const version = url.searchParams.get("version") ?? undefined;
    return { slug, version };
  }

  private async downloadAndExtract(parsed: ParsedRef, destDir: string): Promise<void> {
    const params = new URLSearchParams({ slug: parsed.slug });
    if (parsed.version) params.set("version", parsed.version);

    const url = `${CLAWHUB_BASE}/api/v1/download?${params}`;
    log("downloading", { url });

    const res = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`ClawHub download failed: HTTP ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const zipPath = path.join(destDir, "download.zip");
    await writeFile(zipPath, buffer);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(destDir, true);

    // Clean up the zip file
    await rm(zipPath, { force: true }).catch(() => {});
  }
}
