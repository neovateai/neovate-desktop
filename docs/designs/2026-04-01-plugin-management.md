# Plugin Management (Claude Code Plugins)

**Date:** 2026-04-01
**Status:** Design approved, not yet implemented

## Overview

Add a GUI for managing **Claude Code plugins** within Neovate Desktop. This mirrors what the CLI `/plugin` command does but as a full visual interface. It is NOT related to Neovate's internal plugin system (MainPlugin/RendererPlugin) -- those are two separate concepts.

The feature follows the same pattern as the existing **Skills panel**: a full right panel triggered from the sidebar, backed by a main-process service that reads/writes Claude Code's filesystem directly.

## Approach

**Renderer feature + Main service** (mirrors the skills architecture):

- Main service reads/writes Claude Code's plugin files on disk (`~/.claude/plugins/`, `~/.claude/settings.json`)
- oRPC contract for all IPC communication
- Full right panel UI with 4 tabs: Discover, Installed, Sources, Errors

Alternatives considered:

- **Shell out to Claude CLI** (`claude /plugin install ...`) -- rejected: slow, fragile, hard to get structured data
- **Renderer-only with fs access** -- rejected: violates process boundaries, can't do git operations
- **Shared library/SDK** -- rejected: requires upstream Claude Code changes

## Data Layer

### On-disk data sources (Claude Code's filesystem)

| File                      | Path                                                                                  | What we read/write                                           |
| ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `installed_plugins.json`  | `~/.claude/plugins/installed_plugins.json`                                            | Installed plugins with version, scope, install path, git SHA |
| `known_marketplaces.json` | `~/.claude/plugins/known_marketplaces.json`                                           | Registry of marketplace sources                              |
| `settings.json`           | `~/.claude/settings.json`                                                             | `enabledPlugins` map (`pluginId` -> `boolean`)               |
| `marketplace.json`        | `~/.claude/plugins/marketplaces/{name}/.claude-plugin/marketplace.json`               | Plugin listings per marketplace                              |
| `plugin.json`             | `~/.claude/plugins/cache/{marketplace}/{plugin}/{version}/.claude-plugin/plugin.json` | Individual plugin manifests                                  |
| `config.json`             | `~/.claude/plugins/config.json`                                                       | Plugin-specific options                                      |

### Real file format examples

**installed_plugins.json** (v2 format):

```json
{
  "version": 2,
  "plugins": {
    "superpowers@superpowers-marketplace": [
      {
        "scope": "user",
        "installPath": "~/.claude/plugins/cache/superpowers-marketplace/superpowers/4.0.3",
        "version": "4.0.3",
        "installedAt": "2026-01-07T00:15:19.929Z",
        "lastUpdated": "2026-01-07T00:15:19.929Z",
        "gitCommitSha": "b9e16498..."
      }
    ]
  }
}
```

**known_marketplaces.json**:

```json
{
  "claude-plugins-official": {
    "source": { "source": "github", "repo": "anthropics/claude-plugins-official" },
    "installLocation": "~/.claude/plugins/marketplaces/claude-plugins-official",
    "lastUpdated": "2026-03-20T02:42:55.140Z"
  }
}
```

**settings.json** (plugin-relevant portion):

```json
{
  "enabledPlugins": {
    "superpowers@superpowers-marketplace": false,
    "typescript-lsp@claude-plugins-official": true
  }
}
```

**marketplace.json** (inside marketplace repo):

```json
{
  "name": "claude-plugins-official",
  "description": "Directory of popular Claude Code extensions",
  "plugins": [
    {
      "name": "typescript-lsp",
      "description": "TypeScript language server integration",
      "author": { "name": "Anthropic" },
      "source": "./plugins/typescript-lsp",
      "category": "development",
      "homepage": "https://github.com/anthropics/claude-plugins-official"
    }
  ]
}
```

**plugin.json** (inside cached plugin):

```json
{
  "name": "superpowers",
  "description": "Core skills library for Claude Code",
  "version": "4.0.3",
  "author": { "name": "Jesse Vincent" },
  "homepage": "https://github.com/obra/superpowers",
  "license": "MIT",
  "keywords": ["skills", "tdd", "debugging"]
}
```

## Shared Types

**File:** `src/shared/features/plugins/types.ts`

```ts
// -- Marketplace --

interface MarketplaceSource {
  source: "github" | "git" | "url" | "local";
  repo?: string; // for github
  url?: string; // for git/url
  path?: string; // for local
}

interface Marketplace {
  name: string;
  description?: string;
  source: MarketplaceSource;
  installLocation: string;
  lastUpdated?: string;
  pluginCount: number; // computed
}

// -- Plugin (from marketplace listing) --

interface MarketplacePlugin {
  name: string;
  description?: string;
  author?: { name: string; email?: string; url?: string };
  category?: string;
  homepage?: string;
  version?: string;
  keywords?: string[];
  marketplace: string; // which marketplace it came from
  installed: boolean; // computed: cross-ref with installed_plugins
  enabled?: boolean; // computed: from settings.json
}

// -- Installed Plugin --

interface InstalledPlugin {
  pluginId: string; // "name@marketplace"
  name: string;
  marketplace: string;
  scope: "user" | "project" | "local";
  installPath: string;
  version: string;
  enabled: boolean; // from settings.json
  installedAt: string;
  lastUpdated: string;
  gitCommitSha?: string;
  // Resolved from plugin.json manifest:
  description?: string;
  author?: { name: string; email?: string; url?: string };
  homepage?: string;
  keywords?: string[];
  components: PluginComponents;
}

interface PluginComponents {
  hasCommands: boolean;
  hasSkills: boolean;
  hasAgents: boolean;
  hasHooks: boolean;
  hasMcpServers: boolean;
  hasLspServers: boolean;
}

// -- Updates --

interface PluginUpdate {
  pluginId: string;
  currentVersion: string;
  latestVersion?: string;
  latestSha: string;
}

// -- Errors --

interface PluginError {
  pluginId?: string;
  marketplace?: string;
  type: string;
  message: string;
  timestamp: string;
}
```

## oRPC Contract

**File:** `src/shared/features/plugins/contract.ts`

```ts
export const pluginsContract = {
  // -- Installed Plugins --
  listInstalled: oc.input(z.object({})).output(type<InstalledPlugin[]>()),

  enable: oc.input(z.object({ pluginId: z.string() })).output(type<void>()),

  disable: oc.input(z.object({ pluginId: z.string() })).output(type<void>()),

  uninstall: oc
    .input(z.object({ pluginId: z.string(), scope: z.enum(["user", "project", "local"]) }))
    .output(type<void>()),

  update: oc
    .input(z.object({ pluginId: z.string(), scope: z.enum(["user", "project", "local"]) }))
    .output(type<void>()),

  getReadme: oc
    .input(z.object({ pluginId: z.string(), scope: z.enum(["user", "project", "local"]) }))
    .output(type<string | null>()),

  checkUpdates: oc.input(z.object({})).output(type<PluginUpdate[]>()),

  updateAll: oc.input(z.object({})).output(type<{ updated: number }>()),

  // -- Marketplace Discovery --
  listMarketplaces: oc.input(z.object({})).output(type<Marketplace[]>()),

  addMarketplace: oc
    .input(z.object({ source: z.string() })) // "owner/repo", URL, or path
    .output(type<Marketplace>()),

  removeMarketplace: oc.input(z.object({ name: z.string() })).output(type<void>()),

  updateMarketplace: oc.input(z.object({ name: z.string() })).output(type<Marketplace>()),

  browseMarketplace: oc
    .input(z.object({ marketplace: z.string() }))
    .output(type<MarketplacePlugin[]>()),

  discoverAll: oc
    .input(z.object({ search: z.string().optional() }))
    .output(type<MarketplacePlugin[]>()),

  install: oc
    .input(
      z.object({
        pluginName: z.string(),
        marketplace: z.string(),
        scope: z.enum(["user", "project", "local"]).default("user"),
      }),
    )
    .output(type<InstalledPlugin>()),

  // -- Errors --
  getErrors: oc.input(z.object({})).output(type<PluginError[]>()),
};
```

Wired into `src/shared/contract.ts` as `plugins: pluginsContract`.

## Main Service

**File:** `src/main/features/plugins/plugins-service.ts`

### Constants

```ts
const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const PLUGINS_DIR = path.join(CLAUDE_DIR, "plugins");
const INSTALLED_PLUGINS_FILE = path.join(PLUGINS_DIR, "installed_plugins.json");
const KNOWN_MARKETPLACES_FILE = path.join(PLUGINS_DIR, "known_marketplaces.json");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");
const MARKETPLACES_DIR = path.join(PLUGINS_DIR, "marketplaces");
const CACHE_DIR = path.join(PLUGINS_DIR, "cache");
```

### Key operations

**`listInstalled()`**

1. Read `installed_plugins.json` -> parse v2 format
2. Read `settings.json` -> extract `enabledPlugins`
3. **Flatten the v2 arrays**: each pluginId key maps to an array of scope entries. Emit one `InstalledPlugin` per array entry (same plugin can appear in multiple scopes).
4. For each entry: resolve manifest from cache path (`.claude-plugin/plugin.json`)
5. Merge enabled state + manifest metadata -> `InstalledPlugin[]`

**`discoverAll(search?)`**

1. Read `known_marketplaces.json` -> list of marketplace sources
2. For each marketplace: read `marketplace.json` from `installLocation/.claude-plugin/marketplace.json`
3. Flatten all plugin listings, cross-reference with installed plugins
4. Optional text search filter on name/description/keywords
5. Return `MarketplacePlugin[]`

**`install(pluginName, marketplace, scope)`**

1. Find plugin entry in marketplace manifest -> get `source`
2. Resolve source (see **Source Resolution** below)
3. Copy/clone resolved source to `CACHE_DIR/{marketplace}/{pluginName}/{version}/`
4. Add entry to `installed_plugins.json` (atomic write)
5. Set `enabledPlugins[pluginId] = true` in `settings.json` (atomic write)
6. Return `InstalledPlugin`

**`uninstall(pluginId, scope)`**

1. Remove the matching scope entry from `installed_plugins.json` array (atomic write). If no entries remain for the pluginId, remove the key entirely.
2. Remove from `enabledPlugins` in `settings.json` (atomic write) only if no scope entries remain
3. Optionally remove cache directory

**`getReadme(pluginId, scope)`**

1. Resolve `installPath` from `installed_plugins.json` for the given pluginId + scope
2. Look for `README.md` in the install path root
3. Return file contents as string, or `null` if not found

**`enable(pluginId)` / `disable(pluginId)`**

1. Update `enabledPlugins[pluginId]` in `settings.json` (atomic write)

**`addMarketplace(source)`**

1. Parse input: `"owner/repo"` -> GitHub clone URL, `"https://..."` -> git/URL, path -> local
2. Git clone to `MARKETPLACES_DIR/{name}/`
3. Validate `.claude-plugin/marketplace.json` exists and parses correctly
4. Add entry to `known_marketplaces.json` (atomic write)

**`updateMarketplace(name)`**

1. Git pull in `MARKETPLACES_DIR/{name}/`
2. Update `lastUpdated` in `known_marketplaces.json` (atomic write)

**`removeMarketplace(name)`**

1. Remove from `known_marketplaces.json` (atomic write)
2. Remove directory from `MARKETPLACES_DIR/`

**`checkUpdates()`**

1. For each installed plugin: compare `gitCommitSha` with remote HEAD
2. Return list of plugins with available updates

**`updateAll()`**

1. Call `checkUpdates()` to get list of updatable plugins
2. For each: re-resolve source, re-clone/copy to cache, update `installed_plugins.json`
3. Return updated count

**`getErrors()`**

1. Collect errors from failed operations during the session
2. Include marketplace load failures, manifest parse errors, etc.

### Source Resolution

Plugin `source` in marketplace manifests comes in several forms. The resolver must handle all of them:

| Source type                                      | Example                                                                  | Resolution                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Relative path** (~70% of official marketplace) | `"./plugins/typescript-lsp"`                                             | Resolve relative to marketplace repo dir. Copy (or symlink) to cache. No git clone needed -- the content is already in the cloned marketplace. |
| **GitHub**                                       | `{ source: "github", repo: "owner/repo" }`                               | Construct `https://github.com/{repo}.git`, git clone to cache.                                                                                 |
| **URL (git)**                                    | `{ source: "url", url: "https://github.com/foo/bar.git" }`               | Git clone the URL to cache.                                                                                                                    |
| **git-subdir**                                   | `{ source: "git-subdir", url: "...", path: "plugins/foo", ref: "main" }` | Git clone full repo to temp, copy `path` subdirectory to cache, clean up temp.                                                                 |
| **Local**                                        | `{ source: "local", path: "/abs/path" }`                                 | Symlink or copy from local path.                                                                                                               |

```ts
async function resolvePluginSource(
  source: string | PluginSourceObject,
  marketplaceDir: string,
  destDir: string,
): Promise<void> {
  if (typeof source === "string") {
    // Relative path -- copy from marketplace dir
    const resolved = path.resolve(marketplaceDir, source);
    await fs.cp(resolved, destDir, { recursive: true });
    return;
  }
  switch (source.source) {
    case "github":
      await gitClone(`https://github.com/${source.repo}.git`, destDir);
      break;
    case "url":
      await gitClone(source.url, destDir);
      break;
    case "git-subdir":
      await gitCloneSubdir(source.url, source.path, source.ref, destDir);
      break;
    case "local":
      await fs.cp(source.path, destDir, { recursive: true });
      break;
  }
}
```

### Atomic File Writes

Since both Neovate and Claude Code CLI can write to `settings.json` and `installed_plugins.json` concurrently, all writes must be atomic and non-destructive:

```ts
async function atomicJsonUpdate<T>(filePath: string, updater: (current: T) => T): Promise<void> {
  // 1. Read current file content
  const raw = await fs.readFile(filePath, "utf-8");
  const current = JSON.parse(raw) as T;
  // 2. Apply only our changes (preserve all other keys)
  const updated = updater(current);
  // 3. Write to temp file in same directory (same filesystem for atomic rename)
  const tmp = filePath + ".tmp." + process.pid;
  await fs.writeFile(tmp, JSON.stringify(updated, null, 2) + "\n");
  // 4. Atomic rename
  await fs.rename(tmp, filePath);
}
```

For `settings.json` specifically: only modify the `enabledPlugins` key, never touch other keys like `permissions`, `mcpServers`, etc.

### File Watching

Watch key files for external changes (e.g., user runs `claude /plugin install` in a terminal while Neovate is open):

```ts
// Watch installed_plugins.json and settings.json
// Debounce 500ms to avoid rapid-fire events
// On change: re-read and emit to renderer via oRPC event or store refresh
```

For v1, keep it simple: `fs.watch` with debounce. When a change is detected, the service marks its cache stale. Next time the renderer calls `listInstalled()` or `discoverAll()`, it re-reads from disk. Optionally, the renderer can poll on panel focus (when `fullRightPanelId === "plugins"`).

### Git helper

**File:** `src/main/features/plugins/git-utils.ts`

```ts
// Safe git operations via execFile (no shell injection)
async function gitClone(url: string, dest: string): Promise<void>;
async function gitPull(repoDir: string): Promise<void>;
async function gitGetHeadSha(repoDir: string): Promise<string>;
async function gitCloneSubdir(
  url: string,
  subdir: string,
  ref: string | undefined,
  dest: string,
): Promise<void>;
```

All operations use `child_process.execFile` (not `exec`) to prevent shell injection. Timeouts of 60s for clone, 30s for pull.

### Router

**File:** `src/main/features/plugins/router.ts`

Standard oRPC router mapping contract methods to service calls. Same pattern as `src/main/features/skills/router.ts`.

## UI Architecture

### Entry point: Sidebar trigger

In `src/renderer/src/features/agent/components/panel-trigger-buttons.tsx`, add a "Plugins" button to `PanelTriggerGroup`:

```
+-------------------------------+
| New Chat          (SquarePen) |
| Skills                (Wand2) |
| Plugins              (Puzzle) |  <-- new
| ----------------------------- |
| session list...               |
+-------------------------------+
```

Clicking toggles `openFullRightPanel("plugins")` / `closeFullRightPanel()`, same pattern as skills.

### Full right panel routing

In `src/renderer/src/components/app-layout/full-right-panel.tsx`:

```tsx
{
  fullRightPanelId === "skills" && <SkillsPanel />;
}
{
  fullRightPanelId === "plugins" && <PluginsPanel />;
}
```

### PluginsPanel layout

```
+---------------------------------------------------+
| Plugins                                 [search] [refresh] |
+-----------+-----------+----------+--------+
| Discover  | Installed | Sources  | Errors |  <-- tabs
+-----------+-----------+----------+--------+
|                                                   |
|  +----------+  +----------+  +----------+         |
|  | Plugin A |  | Plugin B |  | Plugin C |         |
|  | desc...  |  | desc...  |  | desc...  |         |
|  | [tags]   |  | [tags]   |  | [tags]   |         |
|  +----------+  +----------+  +----------+         |
|                                                   |
|  +----------+  +----------+  +----------+         |
|  | Plugin D |  | Plugin E |  | Plugin F |         |
|  | desc...  |  | desc...  |  | desc...  |         |
|  | [tags]   |  | [tags]   |  | [tags]   |         |
|  +----------+  +----------+  +----------+         |
+---------------------------------------------------+
```

3-column card grid within `max-w-3xl` container (matches SkillsPanel).

### Tab: Discover

- Calls `discoverAll()` -- all plugins across all marketplaces
- Search bar filters by name/description/keywords
- Card per plugin: initials avatar, name, description (2-line clamp), component badges, version badge
- Already-installed plugins show "Installed" badge instead of download button
- Click card -> PluginDetailModal
- **Empty state (no marketplaces configured):** Shows onboarding CTA:
  "No plugin sources configured. Add the official Claude Code marketplace to get started."
  With a one-click button: "Add Official Marketplace" (adds `anthropics/claude-plugins-official`).
  Below that, a link to "Add custom marketplace" that switches to the Sources tab.

### Tab: Installed

- Calls `listInstalled()` + `checkUpdates()`
- Same card grid with enable/disable Switch toggle
- Scope filter dropdown: "All" / "User" / per-project (same pattern as skills panel)
- Update badge when available
- **"Update All" button** in header when any updates are available
- Click card -> PluginDetailModal with uninstall/update actions

### Tab: Sources (Marketplaces)

- Calls `listMarketplaces()`
- List of marketplace sources: name, plugin count, last updated, source type badge
- "Add Marketplace" button -> AddMarketplaceModal (input for `owner/repo` or URL)
- Per-source actions: refresh (git pull), remove
- Click source -> filtered discover view for that marketplace

### Tab: Errors

- Only shows badge count on tab when errors exist
- Calls `getErrors()`
- List of errors with type, message, timestamp
- Guidance text per error type (e.g., "git auth failed -- check SSH keys")

### Plugin detail modal

Shown when clicking any plugin card (discover or installed):

```
+-------------------------------------------+
| [X]                                       |
|                                           |
| [TS]  TypeScript LSP            v1.0.0   |
|       by Anthropic                        |
|                                           |
| TypeScript language server integration    |
| for enhanced code intelligence...         |
|                                           |
| Components:                               |
|   LSP Servers  |  Hooks                   |
|                                           |
| Source: claude-plugins-official            |
| Homepage: github.com/...                  |
| License: MIT                              |
|                                           |
| [Install v] [User|Project|Local]  or  [Disable] [Uninstall] [Update] |
+-------------------------------------------+
```

Install button is a split button / dropdown for scope selection. Default: "User" scope.
For installed plugins: shows Disable/Uninstall/Update actions instead.

**README section (installed plugins only):** Below the metadata, render the plugin's `README.md` if available (fetched via `getReadme()`). Use a markdown renderer with sensible styling (same as chat message markdown). This gives users the full documentation without leaving the app. For not-yet-installed plugins, show only the short description + homepage link.

**Trust warning:** Before the install button, show a subtle warning banner:

> Plugins can run code on your machine via hooks and MCP servers. Make sure you trust this plugin before installing. Anthropic does not verify third-party plugins.

For the official marketplace (`claude-plugins-official`), the warning can be softer. For community marketplaces, it should be more prominent (yellow/amber background).

**Confirmation dialogs:** Uninstall and Remove Marketplace show a confirmation dialog before proceeding:

- Uninstall: "Uninstall {plugin name}? This will remove the plugin from your {scope} installation."
- Remove marketplace: "Remove {name}? This will remove the marketplace source. Plugins installed from it will remain but can no longer be updated."

## File Structure

```
src/
  shared/features/plugins/
    contract.ts              # oRPC contract (15 methods)
    types.ts                 # InstalledPlugin, MarketplacePlugin, Marketplace, etc.

  main/features/plugins/
    plugins-service.ts       # Core service: filesystem + git operations
    router.ts                # oRPC handlers
    git-utils.ts             # Safe git clone/pull helpers

  renderer/src/features/plugins/
    components/
      plugins-panel.tsx      # Root panel: header, tabs, search
      discover-tab.tsx       # Browse all marketplace plugins
      installed-tab.tsx      # Manage installed plugins
      sources-tab.tsx        # Marketplace source management
      errors-tab.tsx         # Plugin error display
      plugin-detail-modal.tsx
      add-marketplace-modal.tsx
    locales/
      en-US.json             # i18n strings
```

### Existing files to modify

| File                                                                   | Change                         |
| ---------------------------------------------------------------------- | ------------------------------ |
| `src/shared/contract.ts`                                               | Add `plugins: pluginsContract` |
| `src/main/router.ts`                                                   | Wire plugins router            |
| `src/renderer/src/features/agent/components/panel-trigger-buttons.tsx` | Add "Plugins" sidebar button   |
| `src/renderer/src/components/app-layout/full-right-panel.tsx`          | Add `"plugins"` panel case     |

## Session Invalidation

After any mutation (install, uninstall, enable, disable, update), the renderer must invalidate prewarmed Claude Code sessions so new sessions pick up plugin changes. This follows the same pattern as the skills panel:

```ts
const refreshAfterMutation = useCallback(async () => {
  await fetchData();
  const projectPath = useProjectStore.getState().activeProject?.path;
  claudeCodeChatManager.invalidateNewSessions(projectPath);
}, [fetchData]);
```

Every button that calls `install`, `uninstall`, `enable`, `disable`, `update`, or `updateAll` must call `refreshAfterMutation` on success.

## Offline / Network Error Handling

Git operations (marketplace add/update, plugin install from remote) require network access. The design handles this as follows:

- **Cached marketplace data is always available.** `discoverAll()` reads from already-cloned marketplace repos on disk. Users can browse and search even when offline.
- **"Last updated" indicator** on each marketplace source (Sources tab) so users know how stale the data is.
- **Long operations show loading state.** Git clone/pull operations can take seconds. Each card or marketplace source shows a spinner during its operation. The panel remains interactive (other cards are not blocked).
- **Network errors surface in the Errors tab.** Failed git operations are caught, timestamped, and added to the error list. The Errors tab badge count updates.
- **Retry is easy.** Errors tab shows a "Retry" button per error where applicable. Marketplace sources show a refresh button.

## Design Principles

- **Read/write the same files Claude Code uses** -- Neovate is a GUI for the same underlying data. Changes made in Neovate are immediately visible in the CLI and vice versa.
- **Graceful degradation** -- every `readFile` call handles `ENOENT` with a sensible default (empty object/array). If `~/.claude/plugins/` doesn't exist, the service creates it on first write. If `installed_plugins.json` or `known_marketplaces.json` are missing, return empty lists. If a file is corrupt JSON, log the error, surface it in the Errors tab, and treat as empty. Never crash.
- **No shell injection** -- all git operations via `execFile` with explicit args, never `exec` with string interpolation.
- **Follow skills panel patterns** -- same card design, same modal patterns, same oRPC contract style.
- **KISS** -- no plugin sandboxing, no dependency resolution, no auto-update in v1. Users manage plugins; we just provide the UI.
