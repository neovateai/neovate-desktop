# Storage & Settings Module Design

## Problem

The current storage layer has the following issues:

1. **Scattered electron-store instances** — `ProjectStore`, `ConfigStore`, and `BrowserWindowManager` each call `new Store()` independently, duplicating `cwd` and other config with no central management
2. **No persistence API for plugins** — plugins have no way to store data
3. **No settings infrastructure** — no unified read/write mechanism for user settings
4. **No generic storage RPC in the renderer** — each feature writes its own contract + router + Zustand store

## Overview

A unified storage infrastructure providing two layers of capability:

- **StorageService** (`main/core`) — generic KV storage engine, manages multiple `electron-store` instances (one JSON file per namespace), addresses issues 1, 2, 4
- **Storage RPC** (`shared` + `main/features`) — generic ORPC interface, renderer accesses any namespace via `client.storage.get/set/getAll`
- **SettingsService** (`renderer/features`) — wraps Storage RPC with a Zustand cache + optimistic updates, manages the `settings` key in `config.json`, addresses issue 3

## Decision Log

- **Storage engine**: `electron-store`, one JSON file per namespace, lazily created
- **Storage location**: `~/.neovate-desktop/` (consistent with existing)
- **Write strategy**: MVP writes to disk on every `set` call
- **Settings storage**: stored under the `settings` key in `config.json`, isolated by namespace key
- **Plugin storage** (future): one file per plugin (`~/.neovate-desktop/plugin-data/{pluginName}.json`), prefix pre-bound by `PluginManager` — not implemented in MVP
- **Main-side plugin settings**: not provided in MVP, added on demand later
- **Renderer settings**: `SettingsService` implemented in the features layer, interface defined in `core/types.ts`
- **Storage RPC**: generic KV interface, agnostic to whether data is settings or something else
- **Migration**: incremental — existing `ConfigStore`/`ProjectStore` are left untouched for now

## File Storage Layout

```
~/.neovate-desktop/
  config.json          # app config + settings
  projects.json        # project data (existing)
  window-state.json    # window state (existing)
  plugin-data/         # plugin-specific storage (future)
    git.json
    acp.json
    ...
```

### config.json internal structure

```json
{
  "theme": "system",
  "settings": {
    "preferences": { "theme": "dark", "fontSize": 14 },
    "git": { "autoFetch": true }
  }
}
```

- The existing `theme` key is kept for now (will migrate to `settings.preferences.theme` incrementally)
- Keys under `settings` are isolated by namespace

## Code Layout

```
main/core/
  storage-service.ts       # StorageService — manages electron-store instances
  types.ts                 # IMainApp

main/features/storage/
  router.ts                # generic storage ORPC handlers

shared/features/storage/
  contract.ts              # ORPC contract (generic KV)
  types.ts                 # Preferences types

renderer/src/core/
  types.ts                 # IRendererApp (includes ISettingsService interface)

renderer/src/features/settings/
  settings-service.ts      # SettingsService implementation
  store.ts                 # Zustand store
  hooks/use-settings.ts
  index.ts
```

## Main Process — StorageService (core infrastructure)

Manages multiple `electron-store` instances, lazily created per namespace. Supports subdirectory namespaces (e.g. `plugin-data/git`).

```typescript
// main/core/storage-service.ts

interface IStorageService {
  scoped(namespace: string): IScopedStorage;
  dispose(): void;
}

interface IScopedStorage {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  getAll(): Record<string, unknown>;
}

class StorageService implements IStorageService {
  private static readonly BASE_DIR = path.join(os.homedir(), ".neovate-desktop");
  private instances = new Map<string, Store>();

  scoped(namespace: string): IScopedStorage {
    // lazily created; supports subdirectories (plugin-data/git → cwd: BASE_DIR/plugin-data, name: git)
    let store = this.instances.get(namespace);
    if (!store) {
      const dir = path.dirname(namespace);
      const name = path.basename(namespace);
      store = new Store({
        name,
        cwd: dir === "." ? StorageService.BASE_DIR : path.join(StorageService.BASE_DIR, dir),
      });
      this.instances.set(namespace, store);
    }
    return new ScopedStorage(store);
  }

  dispose(): void {
    this.instances.clear();
  }
}
```

## IMainApp + MainApp

```typescript
// main/core/types.ts
interface IMainApp {
  readonly subscriptions: { push(...disposables: Disposable[]): void };
  readonly windowManager: IBrowserWindowManager;
}

// main/app.ts
class MainApp implements IMainApp {
  private readonly storage: StorageService;

  constructor() {
    this.storage = new StorageService();
  }

  // exposed to AppContext (for router use), not part of IMainApp
  getStorage(): StorageService {
    return this.storage;
  }
}
```

## ORPC Contract — Generic KV

```typescript
// shared/features/storage/contract.ts
export const storageContract = {
  get: oc.input(z.object({ namespace: z.string(), key: z.string() })).output(type<unknown>()),
  set: oc
    .input(z.object({ namespace: z.string(), key: z.string(), value: z.unknown() }))
    .output(type<void>()),
  getAll: oc.input(z.object({ namespace: z.string() })).output(type<Record<string, unknown>>()),
};
```

## Storage Router

```typescript
// main/features/storage/router.ts
export const storageRouter = os.storage.router({
  get: os.storage.get.handler(({ input, context }) => {
    return context.storage.scoped(input.namespace).get(input.key);
  }),
  set: os.storage.set.handler(({ input, context }) => {
    context.storage.scoped(input.namespace).set(input.key, input.value);
  }),
  getAll: os.storage.getAll.handler(({ input, context }) => {
    return context.storage.scoped(input.namespace).getAll();
  }),
});
```

## Renderer — SettingsService (features layer)

Interface defined in `core/types.ts`, implementation in `features/settings/`. Backed by a Zustand cache + Storage RPC.

```typescript
// renderer/src/core/types.ts
interface ISettingsService {
  scoped(namespace: string): IScopedSettings;
}

interface IScopedSettings {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): Promise<void>;
  getAll(): Record<string, unknown>;
  subscribe(listener: (data: Record<string, unknown>) => void): () => void;
}

interface IRendererApp {
  readonly settings: ISettingsService;
}
```

### Zustand Store

```typescript
// renderer/src/features/settings/store.ts
type SettingsState = {
  data: Record<string, unknown>;
  loading: boolean;
  fetch: () => Promise<void>;
  get: <T>(key: string) => T | undefined;
  set: (key: string, value: unknown) => Promise<void>;
};
```

- `fetch()`: called once on mount, pulls the `settings` key from the `config` namespace in the main process
- `set()`: optimistically updates in-memory state, then writes to disk via Storage RPC
- `get()`: reads from memory, may return `undefined` — callers provide their own defaults

### SettingsService Implementation

```typescript
// renderer/src/features/settings/settings-service.ts
class SettingsService implements ISettingsService {
  scoped(namespace: string): IScopedSettings {
    return new ScopedSettings(namespace);
  }
}

// ScopedSettings automatically prefixes keys with the namespace and delegates to the Zustand store
```

### Renderer Plugin Usage

```typescript
activate(ctx) {
  const s = ctx.app.settings.scoped("git");
  const autoFetch = s.get<boolean>("autoFetch") ?? true;
  s.subscribe((data) => { /* update UI */ });
}
```

## Startup Flow

```
MainApp.constructor()
  → new StorageService()

MainApp.start()
  → pluginManager.configContributions(ctx)
  → pluginManager.activate(ctx)
  → buildRouter()
  → createMainWindow()

Renderer mount
  → client.storage.getAll({ namespace: "config" })  // fetch full config
  → extract settings key → populate Zustand store cache
```

## Migration Strategy (incremental)

**MVP:**

- Add `StorageService` + generic Storage RPC
- Renderer `SettingsService` wraps settings read/write
- `ConfigStore` kept as-is; `settings` key added to `config.json`
- Existing `config.theme` left untouched

**Follow-up migrations:**

1. `config.theme` → `settings.preferences.theme`, remove `ConfigStore`
2. `ProjectStore` delegates internally to `StorageService`, then remove `ProjectStore`
3. `BrowserWindowManager` switches to `StorageService` internally
4. Main-side plugin settings API (on demand)
5. Plugin-specific storage (`ctx.storage`)

## Constraints

- `get()` may return `undefined` — callers are responsible for providing default values
- Plugin settings have no compile-time type safety — plugins assert types themselves
- Built-in preferences can define static types
- Generic storage RPC will need access control later: renderer plugins should only access their own `plugin-{name}` namespace

## Change Events (future)

Not implemented in MVP. Intended direction:

```typescript
// main process
interface IScopedSettings {
  onDidChange(
    listener: (e: { key: string; value: unknown; previousValue: unknown }) => void,
  ): Unsubscribe;
}
```

Renderer-side `subscribe` is already supported in MVP (via Zustand subscribe).
