import debug from "debug";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type {
  InstalledPlugin,
  Marketplace,
  MarketplacePlugin,
  MarketplaceSource,
  PluginComponents,
  PluginError,
  PluginUpdate,
} from "../../../shared/features/claude-code-plugins/types";

import { gitClone, gitCloneSubdir, gitGetHeadSha, gitPull } from "./git-utils";

const log = debug("neovate:plugins");

const CLAUDE_DIR = path.join(homedir(), ".claude");
const PLUGINS_DIR = path.join(CLAUDE_DIR, "plugins");
const INSTALLED_PLUGINS_FILE = path.join(PLUGINS_DIR, "installed_plugins.json");
const KNOWN_MARKETPLACES_FILE = path.join(PLUGINS_DIR, "known_marketplaces.json");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");
const MARKETPLACES_DIR = path.join(PLUGINS_DIR, "marketplaces");
const CACHE_DIR = path.join(PLUGINS_DIR, "cache");

// -- JSON helpers --

async function readJsonSafe<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function atomicJsonUpdate<T>(
  filePath: string,
  updater: (current: T) => T,
  fallback: T,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const current = await readJsonSafe<T>(filePath, fallback);
  const updated = updater(current);
  const tmp = `${filePath}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(updated, null, 2) + "\n");
  await rename(tmp, filePath);
}

// -- Source resolution --

interface PluginSourceObject {
  source: string;
  repo?: string;
  url?: string;
  path?: string;
  ref?: string;
  sha?: string;
}

async function resolvePluginSource(
  source: string | PluginSourceObject,
  marketplaceDir: string,
  destDir: string,
): Promise<void> {
  if (typeof source === "string") {
    const resolved = path.resolve(marketplaceDir, source);
    await cp(resolved, destDir, { recursive: true });
    return;
  }
  switch (source.source) {
    case "github":
      await gitClone(`https://github.com/${source.repo}.git`, destDir);
      break;
    case "url":
      await gitClone(source.url!, destDir);
      break;
    case "git-subdir":
      await gitCloneSubdir(source.url!, source.path!, source.ref, destDir);
      break;
    case "local":
      await cp(source.path!, destDir, { recursive: true });
      break;
    default:
      throw new Error(`Unknown plugin source type: ${source.source}`);
  }
}

// -- Plugin manifest helpers --

interface PluginManifest {
  name?: string;
  description?: string;
  version?: string;
  author?: { name: string; email?: string; url?: string };
  homepage?: string;
  license?: string;
  keywords?: string[];
  commands?: unknown;
  commandsPaths?: unknown;
  skills?: unknown;
  skillsPaths?: unknown;
  agents?: unknown;
  agentsPaths?: unknown;
  hooks?: unknown;
  hooksPath?: unknown;
  mcpServers?: unknown;
  lspServers?: unknown;
}

function detectComponents(manifest: PluginManifest): PluginComponents {
  return {
    hasCommands: !!(manifest.commands || manifest.commandsPaths),
    hasSkills: !!(manifest.skills || manifest.skillsPaths),
    hasAgents: !!(manifest.agents || manifest.agentsPaths),
    hasHooks: !!(manifest.hooks || manifest.hooksPath),
    hasMcpServers: !!manifest.mcpServers,
    hasLspServers: !!manifest.lspServers,
  };
}

async function readPluginManifest(installPath: string): Promise<PluginManifest> {
  const manifestPath = path.join(installPath, ".claude-plugin", "plugin.json");
  return readJsonSafe<PluginManifest>(manifestPath, {});
}

// -- Marketplace manifest --

interface MarketplaceManifest {
  name?: string;
  description?: string;
  plugins?: Array<{
    name: string;
    description?: string;
    author?: { name: string; email?: string; url?: string };
    category?: string;
    homepage?: string;
    version?: string;
    keywords?: string[];
    source: string | PluginSourceObject;
  }>;
}

// -- Installed plugins file format (v2) --

interface InstalledPluginsFile {
  version: number;
  plugins: Record<
    string,
    Array<{
      scope: string;
      projectPath?: string;
      installPath: string;
      version: string;
      installedAt: string;
      lastUpdated: string;
      gitCommitSha?: string;
    }>
  >;
}

const EMPTY_INSTALLED: InstalledPluginsFile = { version: 2, plugins: {} };

// -- Settings file --

interface SettingsFile {
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
}

// ============================================================

export class PluginsService {
  private errors: PluginError[] = [];

  private addError(err: Partial<PluginError> & { message: string; type: string }): void {
    this.errors.push({ ...err, timestamp: new Date().toISOString() });
  }

  async listInstalled(): Promise<InstalledPlugin[]> {
    log("listInstalled");
    const installed = await readJsonSafe<InstalledPluginsFile>(
      INSTALLED_PLUGINS_FILE,
      EMPTY_INSTALLED,
    );
    const settings = await readJsonSafe<SettingsFile>(SETTINGS_FILE, {});
    const enabledMap = settings.enabledPlugins ?? {};

    const results: InstalledPlugin[] = [];

    for (const [pluginId, entries] of Object.entries(installed.plugins ?? {})) {
      const [name, marketplace] = parsePluginId(pluginId);

      for (const entry of entries) {
        const manifest = await readPluginManifest(entry.installPath);
        results.push({
          pluginId,
          name: manifest.name ?? name,
          marketplace,
          scope: entry.scope as InstalledPlugin["scope"],
          projectPath: entry.projectPath,
          installPath: entry.installPath,
          version: manifest.version ?? entry.version ?? "unknown",
          enabled: enabledMap[pluginId] !== false,
          installedAt: entry.installedAt,
          lastUpdated: entry.lastUpdated,
          gitCommitSha: entry.gitCommitSha,
          description: manifest.description,
          author: manifest.author,
          homepage: manifest.homepage,
          license: manifest.license,
          keywords: manifest.keywords,
          components: detectComponents(manifest),
        });
      }
    }

    return results;
  }

  async enable(pluginId: string): Promise<void> {
    log("enable %s", pluginId);
    await atomicJsonUpdate<SettingsFile>(
      SETTINGS_FILE,
      (settings) => ({
        ...settings,
        enabledPlugins: { ...settings.enabledPlugins, [pluginId]: true },
      }),
      {},
    );
  }

  async disable(pluginId: string): Promise<void> {
    log("disable %s", pluginId);
    await atomicJsonUpdate<SettingsFile>(
      SETTINGS_FILE,
      (settings) => ({
        ...settings,
        enabledPlugins: { ...settings.enabledPlugins, [pluginId]: false },
      }),
      {},
    );
  }

  async uninstall(pluginId: string, scope: string, projectPath?: string): Promise<void> {
    log("uninstall %s scope=%s projectPath=%s", pluginId, scope, projectPath);

    await atomicJsonUpdate<InstalledPluginsFile>(
      INSTALLED_PLUGINS_FILE,
      (file) => {
        const entries = file.plugins[pluginId];
        if (!entries) return file;
        const remaining = entries.filter(
          (e) => !(e.scope === scope && e.projectPath === projectPath),
        );
        const plugins = { ...file.plugins };
        if (remaining.length === 0) {
          delete plugins[pluginId];
        } else {
          plugins[pluginId] = remaining;
        }
        return { ...file, plugins };
      },
      EMPTY_INSTALLED,
    );

    // Remove from enabledPlugins if no entries remain
    const installed = await readJsonSafe<InstalledPluginsFile>(
      INSTALLED_PLUGINS_FILE,
      EMPTY_INSTALLED,
    );
    if (!installed.plugins[pluginId]) {
      await atomicJsonUpdate<SettingsFile>(
        SETTINGS_FILE,
        (settings) => {
          const enabledPlugins = { ...settings.enabledPlugins };
          delete enabledPlugins[pluginId];
          return { ...settings, enabledPlugins };
        },
        {},
      );
    }
  }

  async getReadme(pluginId: string, scope: string, projectPath?: string): Promise<string | null> {
    log("getReadme %s scope=%s projectPath=%s", pluginId, scope, projectPath);
    const installed = await readJsonSafe<InstalledPluginsFile>(
      INSTALLED_PLUGINS_FILE,
      EMPTY_INSTALLED,
    );
    const entries = installed.plugins[pluginId];
    const entry = entries?.find((e) => e.scope === scope && e.projectPath === projectPath);
    if (!entry) return null;

    try {
      return await readFile(path.join(entry.installPath, "README.md"), "utf-8");
    } catch {
      return null;
    }
  }

  async checkUpdates(): Promise<PluginUpdate[]> {
    log("checkUpdates");
    const installed = await readJsonSafe<InstalledPluginsFile>(
      INSTALLED_PLUGINS_FILE,
      EMPTY_INSTALLED,
    );
    const updates: PluginUpdate[] = [];

    for (const [pluginId, entries] of Object.entries(installed.plugins ?? {})) {
      for (const entry of entries) {
        if (!entry.gitCommitSha) continue;
        try {
          const headSha = await gitGetHeadSha(entry.installPath);
          if (headSha !== entry.gitCommitSha) {
            updates.push({
              pluginId,
              scope: entry.scope as PluginUpdate["scope"],
              projectPath: entry.projectPath,
              currentVersion: entry.version,
              latestSha: headSha,
            });
          }
        } catch {
          // Can't check — skip
        }
      }
    }

    return updates;
  }

  async update(pluginId: string, scope: string, projectPath?: string): Promise<void> {
    log("update %s scope=%s projectPath=%s", pluginId, scope, projectPath);
    const installed = await readJsonSafe<InstalledPluginsFile>(
      INSTALLED_PLUGINS_FILE,
      EMPTY_INSTALLED,
    );
    const entries = installed.plugins[pluginId];
    const entry = entries?.find((e) => e.scope === scope && e.projectPath === projectPath);
    if (!entry) throw new Error(`Plugin ${pluginId} not found in scope ${scope}`);

    try {
      await gitPull(entry.installPath);
    } catch {
      // Not a git repo or pull failed — try re-reading manifest
    }

    const newSha = await gitGetHeadSha(entry.installPath).catch(() => undefined);
    const manifest = await readPluginManifest(entry.installPath);

    await atomicJsonUpdate<InstalledPluginsFile>(
      INSTALLED_PLUGINS_FILE,
      (file) => {
        const fileEntries = file.plugins[pluginId] ?? [];
        return {
          ...file,
          plugins: {
            ...file.plugins,
            [pluginId]: fileEntries.map((e) =>
              e.scope === scope && e.projectPath === projectPath
                ? {
                    ...e,
                    version: manifest.version ?? e.version,
                    lastUpdated: new Date().toISOString(),
                    gitCommitSha: newSha ?? e.gitCommitSha,
                  }
                : e,
            ),
          },
        };
      },
      EMPTY_INSTALLED,
    );
  }

  async updateAll(): Promise<{ updated: number }> {
    log("updateAll");
    const installed = await this.listInstalled();
    let updated = 0;

    for (const plugin of installed) {
      try {
        await this.update(plugin.pluginId, plugin.scope, plugin.projectPath);
        updated++;
      } catch (e) {
        this.addError({
          pluginId: plugin.pluginId,
          type: "update-failed",
          message: e instanceof Error ? e.message : "Update failed",
        });
      }
    }

    return { updated };
  }

  // -- Marketplace operations --

  async listMarketplaces(): Promise<Marketplace[]> {
    log("listMarketplaces");
    const known = await readJsonSafe<Record<string, KnownMarketplaceEntry>>(
      KNOWN_MARKETPLACES_FILE,
      {},
    );

    const results: Marketplace[] = [];
    for (const [name, entry] of Object.entries(known)) {
      const manifest = await this.readMarketplaceManifest(entry.installLocation);
      results.push({
        name,
        description: manifest.description,
        source: entry.source,
        installLocation: entry.installLocation,
        lastUpdated: entry.lastUpdated,
        pluginCount: manifest.plugins?.length ?? 0,
      });
    }

    return results;
  }

  async addMarketplace(sourceInput: string): Promise<Marketplace> {
    log("addMarketplace %s", sourceInput);
    const { name, cloneUrl, source } = parseMarketplaceInput(sourceInput);

    const installLocation = path.join(MARKETPLACES_DIR, name);

    await mkdir(MARKETPLACES_DIR, { recursive: true });
    await gitClone(cloneUrl, installLocation);

    const manifest = await this.readMarketplaceManifest(installLocation);
    const marketplaceName = manifest.name ?? name;

    const entry: KnownMarketplaceEntry = {
      source,
      installLocation,
      lastUpdated: new Date().toISOString(),
    };

    await atomicJsonUpdate<Record<string, KnownMarketplaceEntry>>(
      KNOWN_MARKETPLACES_FILE,
      (known) => ({ ...known, [marketplaceName]: entry }),
      {},
    );

    return {
      name: marketplaceName,
      description: manifest.description,
      source,
      installLocation,
      lastUpdated: entry.lastUpdated,
      pluginCount: manifest.plugins?.length ?? 0,
    };
  }

  async removeMarketplace(name: string): Promise<void> {
    log("removeMarketplace %s", name);
    const known = await readJsonSafe<Record<string, KnownMarketplaceEntry>>(
      KNOWN_MARKETPLACES_FILE,
      {},
    );
    const entry = known[name];

    await atomicJsonUpdate<Record<string, KnownMarketplaceEntry>>(
      KNOWN_MARKETPLACES_FILE,
      (k) => {
        const updated = { ...k };
        delete updated[name];
        return updated;
      },
      {},
    );

    if (entry?.installLocation) {
      await rm(entry.installLocation, { recursive: true, force: true });
    }
  }

  async updateMarketplace(name: string): Promise<Marketplace> {
    log("updateMarketplace %s", name);
    const known = await readJsonSafe<Record<string, KnownMarketplaceEntry>>(
      KNOWN_MARKETPLACES_FILE,
      {},
    );
    const entry = known[name];
    if (!entry) throw new Error(`Marketplace not found: ${name}`);

    await gitPull(entry.installLocation);

    const lastUpdated = new Date().toISOString();
    await atomicJsonUpdate<Record<string, KnownMarketplaceEntry>>(
      KNOWN_MARKETPLACES_FILE,
      (k) => ({ ...k, [name]: { ...k[name]!, lastUpdated } }),
      {},
    );

    const manifest = await this.readMarketplaceManifest(entry.installLocation);

    return {
      name,
      description: manifest.description,
      source: entry.source,
      installLocation: entry.installLocation,
      lastUpdated,
      pluginCount: manifest.plugins?.length ?? 0,
    };
  }

  async browseMarketplace(marketplace: string): Promise<MarketplacePlugin[]> {
    log("browseMarketplace %s", marketplace);
    const known = await readJsonSafe<Record<string, KnownMarketplaceEntry>>(
      KNOWN_MARKETPLACES_FILE,
      {},
    );
    const entry = known[marketplace];
    if (!entry) return [];

    return this.loadMarketplacePlugins(marketplace, entry.installLocation);
  }

  async discoverAll(search?: string): Promise<MarketplacePlugin[]> {
    log("discoverAll search=%s", search);
    const known = await readJsonSafe<Record<string, KnownMarketplaceEntry>>(
      KNOWN_MARKETPLACES_FILE,
      {},
    );

    let allPlugins: MarketplacePlugin[] = [];
    for (const [name, entry] of Object.entries(known)) {
      try {
        const plugins = await this.loadMarketplacePlugins(name, entry.installLocation);
        allPlugins.push(...plugins);
      } catch (e) {
        this.addError({
          marketplace: name,
          type: "marketplace-load-failed",
          message: e instanceof Error ? e.message : "Failed to load marketplace",
        });
      }
    }

    if (search) {
      const q = search.toLowerCase();
      allPlugins = allPlugins.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.keywords?.some((k) => k.toLowerCase().includes(q)),
      );
    }

    return allPlugins;
  }

  async install(
    pluginName: string,
    marketplace: string,
    scope: string,
    projectPath?: string,
  ): Promise<InstalledPlugin> {
    log("install %s from %s scope=%s projectPath=%s", pluginName, marketplace, scope, projectPath);

    if ((scope === "project" || scope === "local") && !projectPath) {
      throw new Error(`projectPath is required when scope is "${scope}"`);
    }

    const known = await readJsonSafe<Record<string, KnownMarketplaceEntry>>(
      KNOWN_MARKETPLACES_FILE,
      {},
    );
    const mpEntry = known[marketplace];
    if (!mpEntry) throw new Error(`Marketplace not found: ${marketplace}`);

    const manifest = await this.readMarketplaceManifest(mpEntry.installLocation);
    const pluginEntry = manifest.plugins?.find((p) => p.name === pluginName);
    if (!pluginEntry) throw new Error(`Plugin not found: ${pluginName} in ${marketplace}`);

    const version = pluginEntry.version ?? "unknown";
    let destDir: string;
    if (scope === "project" && projectPath) {
      destDir = path.join(projectPath, ".claude", "plugins", pluginName);
    } else if (scope === "local" && projectPath) {
      destDir = path.join(projectPath, ".claude", "plugins.local", pluginName);
    } else {
      destDir = path.join(CACHE_DIR, marketplace, pluginName, version);
    }
    await mkdir(path.dirname(destDir), { recursive: true });
    await rm(destDir, { recursive: true, force: true });

    await resolvePluginSource(pluginEntry.source, mpEntry.installLocation, destDir);

    const sha = await gitGetHeadSha(destDir).catch(() => undefined);
    const pluginId = `${pluginName}@${marketplace}`;
    const now = new Date().toISOString();

    await atomicJsonUpdate<InstalledPluginsFile>(
      INSTALLED_PLUGINS_FILE,
      (file) => {
        const existing = file.plugins[pluginId] ?? [];
        const filtered = existing.filter(
          (e) => !(e.scope === scope && e.projectPath === projectPath),
        );
        return {
          ...file,
          plugins: {
            ...file.plugins,
            [pluginId]: [
              ...filtered,
              {
                scope,
                projectPath,
                installPath: destDir,
                version,
                installedAt: now,
                lastUpdated: now,
                gitCommitSha: sha,
              },
            ],
          },
        };
      },
      EMPTY_INSTALLED,
    );

    await atomicJsonUpdate<SettingsFile>(
      SETTINGS_FILE,
      (settings) => ({
        ...settings,
        enabledPlugins: { ...settings.enabledPlugins, [pluginId]: true },
      }),
      {},
    );

    const pluginManifest = await readPluginManifest(destDir);

    return {
      pluginId,
      name: pluginManifest.name ?? pluginName,
      marketplace,
      scope: scope as InstalledPlugin["scope"],
      projectPath,
      installPath: destDir,
      version: pluginManifest.version ?? version,
      enabled: true,
      installedAt: now,
      lastUpdated: now,
      gitCommitSha: sha,
      description: pluginManifest.description ?? pluginEntry.description,
      author: pluginManifest.author ?? pluginEntry.author,
      homepage: pluginManifest.homepage ?? pluginEntry.homepage,
      license: pluginManifest.license,
      keywords: pluginManifest.keywords,
      components: detectComponents(pluginManifest),
    };
  }

  getErrors(): PluginError[] {
    return [...this.errors];
  }

  // -- Private helpers --

  private async readMarketplaceManifest(installLocation: string): Promise<MarketplaceManifest> {
    const manifestPath = path.join(installLocation, ".claude-plugin", "marketplace.json");
    return readJsonSafe<MarketplaceManifest>(manifestPath, {});
  }

  private async loadMarketplacePlugins(
    marketplace: string,
    installLocation: string,
  ): Promise<MarketplacePlugin[]> {
    const manifest = await this.readMarketplaceManifest(installLocation);
    if (!manifest.plugins) return [];

    const installed = await readJsonSafe<InstalledPluginsFile>(
      INSTALLED_PLUGINS_FILE,
      EMPTY_INSTALLED,
    );
    const settings = await readJsonSafe<SettingsFile>(SETTINGS_FILE, {});
    const enabledMap = settings.enabledPlugins ?? {};

    return manifest.plugins.map((p) => {
      const pluginId = `${p.name}@${marketplace}`;
      const isInstalled = !!installed.plugins[pluginId]?.length;
      return {
        name: p.name,
        description: p.description,
        author: p.author,
        category: p.category,
        homepage: p.homepage,
        version: p.version,
        keywords: p.keywords,
        marketplace,
        installed: isInstalled,
        enabled: isInstalled ? enabledMap[pluginId] !== false : undefined,
      };
    });
  }
}

// -- Marketplace input parsing --

type KnownMarketplaceEntry = {
  source: MarketplaceSource;
  installLocation: string;
  lastUpdated?: string;
  autoUpdate?: boolean;
};

function parseMarketplaceInput(input: string): {
  name: string;
  cloneUrl: string;
  source: MarketplaceSource;
} {
  const trimmed = input.trim();

  // GitHub shorthand: "owner/repo"
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    return {
      name: trimmed.split("/")[1]!,
      cloneUrl: `https://github.com/${trimmed}.git`,
      source: { source: "github", repo: trimmed },
    };
  }

  // Git URL
  if (trimmed.startsWith("https://") || trimmed.startsWith("git@")) {
    const name =
      trimmed
        .split("/")
        .pop()
        ?.replace(/\.git$/, "") ?? "unknown";
    return {
      name,
      cloneUrl: trimmed,
      source: { source: "git", url: trimmed },
    };
  }

  throw new Error(`Invalid marketplace source: ${trimmed}. Use "owner/repo" or a git URL.`);
}

function parsePluginId(pluginId: string): [name: string, marketplace: string] {
  const at = pluginId.lastIndexOf("@");
  if (at === -1) return [pluginId, "unknown"];
  return [pluginId.slice(0, at), pluginId.slice(at + 1)];
}
