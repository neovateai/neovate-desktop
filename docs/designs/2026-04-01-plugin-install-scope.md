# Plugin Install Scope with Project Awareness

## Problem

When installing a Claude Code plugin to `project` or `local` scope, the backend needs a `projectPath` to know _where_ to install. The current UI blindly sends `"project"` or `"local"` with no path. Neovate manages multiple projects, unlike the Claude Code CLI which always has an implicit CWD.

## Approach

Follow the same pattern used by skill install (`skill-add-modal.tsx`): show registered projects in the scope dropdown, derive `scope` + `projectPath` from the selection.

## Changes

### 1. Contract (`shared/features/claude-code-plugins/contract.ts`)

Add `projectPath` to every method that identifies a plugin by `pluginId` + `scope`:

```ts
install: oc
  .input(
    z.object({
      pluginName: z.string(),
      marketplace: z.string(),
      scope: scopeSchema.default("user"),
      projectPath: z.string().optional(), // required when scope is "project" or "local"
    }),
  )
  .output(type<InstalledPlugin>()),

uninstall: oc
  .input(z.object({ pluginId: z.string(), scope: scopeSchema, projectPath: z.string().optional() }))
  .output(type<void>()),

update: oc
  .input(z.object({ pluginId: z.string(), scope: scopeSchema, projectPath: z.string().optional() }))
  .output(type<void>()),

getReadme: oc
  .input(z.object({ pluginId: z.string(), scope: scopeSchema, projectPath: z.string().optional() }))
  .output(type<string | null>()),
```

Methods that do NOT need `projectPath`:

- `enable` / `disable` — global toggle in `~/.claude/settings.json`, not per-scope
- `listInstalled` — returns all entries, `projectPath` comes from the stored data
- `checkUpdates` — returns all entries, `projectPath` comes from the `PluginUpdate` return type (see section 5)

### 2. Backend (`main/features/claude-code-plugins/plugins-service.ts`)

`install()` method — change install destination based on scope + projectPath:

| scope     | destination                                                                 |
| --------- | --------------------------------------------------------------------------- |
| `user`    | `~/.claude/plugins/cache/<marketplace>/<name>/<version>` (current behavior) |
| `project` | `<projectPath>/.claude/plugins/<name>/`                                     |
| `local`   | `<projectPath>/.claude/plugins.local/<name>/`                               |

Validate that `projectPath` is provided when scope is `project` or `local`.

`uninstall()` and `update()` methods — accept optional `projectPath` param. Use it together with `pluginId` + `scope` to disambiguate when the same plugin is installed to the same scope across multiple projects.

Store `projectPath` in `InstalledPluginsFile` entries so `listInstalled` can work from the single central file without scanning every project directory:

```ts
interface InstalledPluginsFile {
  version: number;
  plugins: Record<
    string,
    Array<{
      scope: string;
      projectPath?: string; // added: which project this belongs to
      installPath: string;
      version: string;
      installedAt: string;
      lastUpdated: string;
      gitCommitSha?: string;
    }>
  >;
}
```

### 3. UI (`plugin-detail-modal.tsx`)

Replace the current 3-option `Select` with a two-level selection:

**Primary dropdown** — "Install to":

- `User (global)` — value `"user"`
- `<ProjectName>` — one entry per registered project, value = project path

**Secondary toggle** (only visible when a project is selected):

- `Shared` (scope `"project"`, committed to git)
- `Local only` (scope `"local"`, gitignored)

State changes from:

```ts
const [installScope, setInstallScope] = useState<string>("user");
```

to:

```ts
const [installTarget, setInstallTarget] = useState<string>("user"); // "user" | projectPath
const [projectScope, setProjectScope] = useState<"project" | "local">("project");
```

On install, derive the RPC params:

```ts
const scope = installTarget === "user" ? "user" : projectScope;
const projectPath = installTarget === "user" ? undefined : installTarget;
```

**Props change**: `PluginDetailModal` receives `projects: Project[]` (passed from `PluginsPanel` via `useProjectStore`).

When no projects are registered, the dropdown only shows "User (global)" and the secondary shared/local toggle is not rendered.

### 4. Wiring (`plugins-panel.tsx` -> child tabs -> modal)

`PluginsPanel` reads `projects` from `useProjectStore` (already imported) and threads it through `DiscoverTab` / `InstalledTab` -> `PluginDetailModal`.

### 5. Types (`shared/features/claude-code-plugins/types.ts`)

Add `projectPath` to `InstalledPlugin` and `PluginUpdate` so the UI can display which project a plugin belongs to and pass the correct path back for mutations:

```ts
export interface InstalledPlugin {
  // ... existing fields ...
  projectPath?: string; // set for project/local scoped plugins
}

export interface PluginUpdate {
  pluginId: string;
  scope: "user" | "project" | "local";
  projectPath?: string; // needed to call update() unambiguously
  currentVersion: string;
  latestSha?: string;
}
```

The Installed tab should render the project name in the scope badge for project/local plugins (e.g. "project: neovate-desktop" instead of just "project").

## Reference

- Skills use the same pattern: `skill-add-modal.tsx:228-249` (scope dropdown with projects list)
- Skills contract: `shared/features/skills/contract.ts` — `installFromPreview` has `scope` + `projectPath`
- Project store: `features/project/store.ts` — `useProjectStore` exposes `projects: ProjectInfo[]`
