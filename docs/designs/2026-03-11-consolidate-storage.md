# Consolidate Storage: Providers → config.json, Accordions → projects.json

**Date:** 2026-03-11

## Goal

1. **Providers → `config.json`**: Merge `ProviderStore` into `ConfigStore`. Eliminate `providers.json`.
2. **`closedProjectAccordions` → `projects.json`**: Move from `ConfigStore`/`AppConfig` to `ProjectStore`/`ProjectStoreSchema`.
3. **Per-project provider/model selection → `projects.json`**: Eliminate `projects/<encoded-cwd>.json` files. Store as `Record<projectPath, { provider?, model? }>` in `projects.json`, consistent with existing `archivedSessions`/`pinnedSessions` pattern.

## Type Changes

### `AppConfig` (shared/features/config/types.ts)

```diff
 export type AppConfig = {
   theme: Theme;
   locale: Locales;
   runOnStartup: boolean;
   multiProjectSupport: boolean;
   terminalFontSize: number;
   terminalFont: string;
   developerMode: boolean;

   sidebarOrganize: SidebarOrganize;
   sidebarSortBy: SidebarSortBy;
-  closedProjectAccordions: string[];

   sendMessageWith: SendMessageWith;
   agentLanguage: AgentLanguage;
   approvalMode: ApprovalMode;
   notificationSound: NotificationSound;

   keybindings: Record<string, string>;
+
+  // Provider Settings
+  providers: Provider[];
+  provider?: string;   // global selected provider ID
+  model?: string;      // global selected model
 };
```

### `ProjectStoreSchema` (shared/features/project/types.ts)

```diff
 export type ProjectStore = {
   projects: Project[];
   activeProjectId: string | null;
   archivedSessions: Record<string, string[]>;
   pinnedSessions: Record<string, string[]>;
+  closedProjectAccordions: string[];
+  /** projectPath → provider/model selection */
+  providerSelections: Record<string, ProjectProviderConfig>;
 };
```

### `ProviderConfig` type — deleted

`ProviderConfig` from `shared/features/provider/types.ts` is removed. Its fields are absorbed into `AppConfig`. `ProjectProviderConfig` stays (used for per-project/session selection shape).

## Store Changes

### `ConfigStore` — gains provider CRUD methods

Methods moved from `ProviderStore`:

- `getProviders()`, `getProvider(id)`, `addProvider()`, `updateProvider()`, `removeProvider()`
- `getGlobalSelection()`, `setGlobalSelection()`

Defaults gain `providers: []`.

### `ProjectStore` — gains accordion + project provider selection

New methods:

- `getClosedProjectAccordions()` / `setClosedProjectAccordions(ids: string[])`
- `getProjectSelection(cwd: string)` / `setProjectSelection(cwd, provider?, model?)`

Defaults gain `closedProjectAccordions: []`, `providerSelections: {}`.

### `ProviderStore` — deleted entirely

The class and its file are removed.

## Router Changes

### `providerRouter` (provider/router.ts)

Implementation changes from `context.providerStore.*` to:

- `context.configStore.*` for provider CRUD + global selection
- `context.projectStore.*` for project selection

The ORPC `providerContract` stays the same — no renderer API changes.

### `projectRouter` (project/router.ts)

New endpoints:

- `getClosedAccordions` → `context.projectStore.getClosedProjectAccordions()`
- `setClosedAccordions` → `context.projectStore.setClosedProjectAccordions(ids)`

### `configRouter` (config/router.ts)

No changes to the router itself. `closedProjectAccordions` is removed from `AppConfig`, so `config.get()`/`config.set()` no longer serve it.

## Dependency Rewiring

| Consumer                        | Currently                                           | After                                                                           |
| ------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `main/index.ts`                 | Creates `ProviderStore`, passes to `SessionManager` | Remove `ProviderStore`. Pass `configStore` + `projectStore` to `SessionManager` |
| `main/router.ts` (`AppContext`) | Has `providerStore` field                           | Remove `providerStore` field                                                    |
| `provider/router.ts`            | `context.providerStore.*`                           | `context.configStore.*` + `context.projectStore.*`                              |
| `claude-settings.ts`            | Takes `ProviderStore` param                         | Takes `ConfigStore` + `ProjectStore` params                                     |
| `session-manager.ts`            | Constructor takes `ProviderStore`                   | Constructor takes `ConfigStore` + `ProjectStore`                                |
| Renderer `useConfigStore`       | Holds `closedProjectAccordions`                     | Removed from here                                                               |
| Renderer `useProjectStore`      | No accordion state                                  | Gains `closedProjectAccordions` + RPC calls                                     |
| Renderer `useProviderStore`     | Calls `client.provider.*`                           | No change (ORPC contract unchanged)                                             |

## Migration (on startup, in `main/index.ts`)

Idempotent, runs every startup, short-circuits if source files don't exist:

1. If `~/.neovate-desktop/providers.json` exists → read it, merge `providers`/`provider`/`model` into `config.json`, rename to `providers.json.bak`
2. If `config.json` has `closedProjectAccordions` → move to `projects.json`, delete key from `config.json`
3. If `~/.neovate-desktop/projects/*.json` files exist → read each, merge into `projects.json` `providerSelections`, rename directory to `projects.bak/`

Log all migration actions. Source files renamed to `.bak` for recovery.

## What stays the same

- ORPC `providerContract` — no renderer API changes for provider CRUD
- Per-session provider/model in `sessions/<sessionId>.json` — untouched
- `.claude/settings.local.json` / `.claude/settings.json` — untouched (SDK model scope)
- `StorageService` / `StateStore` — untouched
