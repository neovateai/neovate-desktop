# Storage & Settings Module Design

## 问题

当前存储层存在以下问题：

1. **electron-store 实例分散** — ProjectStore、ConfigStore、BrowserWindowManager 各自 `new Store()`，`cwd` 等配置重复，没有统一管理
2. **插件没有持久化能力** — 插件想存数据没有 API
3. **没有 settings 基础设施** — 用户/插件设置没有统一的读写机制
4. **Renderer 没有通用存储 RPC** — 每个 feature 各写一套 contract + router + Zustand store

## Overview

统一的存储基础设施，提供两层能力：

- **StorageService** — core 层通用 KV 存储引擎，管理多个 electron-store 实例（每个 namespace 一个 JSON 文件），解决问题 1、2、4
- **SettingsService** — 基于 StorageService 封装，专门管理用户/插件设置，读写 config.json 的 `settings` 字段，解决问题 3

## 决策记录

- **存储引擎**: electron-store，每个 namespace 一个 JSON 文件，懒创建
- **存储位置**: `~/.neovate-desktop/`（与现有一致）
- **写盘策略**: MVP 每次 set 直接写盘
- **settings 存储**: 放在 config.json 的 `settings` 字段下，按 namespace key 隔离
- **插件 storage**（后续）: 每个插件独立文件（`~/.neovate-desktop/plugin-data/{pluginName}.json`），PluginManager 预绑定前缀，MVP 不实现
- **PluginContext 划分原则**: app 级共享能力挂 `ctx.app`，插件专属/工具能力挂 `ctx`
- **Renderer**: settings 走 Zustand 缓存 + subscribe（高频响应式），storage 走纯 RPC（低频）
- **迁移**: 渐进式，现有 ConfigStore/ProjectStore 暂不动，后续逐步迁移

## 文件存储结构

```
~/.neovate-desktop/
  config.json          # 系统配置 + settings
  projects.json        # 项目数据（现有）
  window-state.json    # 窗口状态（现有）
  plugin-data/         # 插件专属存储（后续）
    git.json
    acp.json
    ...
```

### config.json 内部结构

```json
{
  "theme": "system",
  "settings": {
    "preferences": { "theme": "dark", "fontSize": 14 },
    "git": { "autoFetch": true, "_v": 1 }
  }
}
```

- 现有 `theme` 字段暂时保留（渐进迁移到 `settings.preferences.theme`）
- `settings` 字段下按 namespace 隔离

## 代码布局

```
main/core/
  storage-service.ts       # StorageService — 管理 electron-store 实例
  settings-service.ts      # SettingsService — 基于 StorageService 封装
  types.ts                 # IMainApp（加 settings）

main/features/storage/
  router.ts                # storage + settings ORPC handlers

shared/features/storage/
  contract.ts              # ORPC contract
  types.ts

renderer/src/core/
  storage/
    settings-service.ts    # RendererSettingsService
    storage-client.ts      # RendererStorageClient（纯 RPC）

renderer/src/features/settings/
  store.ts                 # settings Zustand store
  hooks/use-settings.ts
  index.ts
```

## Main 侧 — StorageService（core 基础设施）

内部代码使用，不暴露给插件。管理多个 electron-store 实例，按 namespace 懒创建。

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
  private instances = new Map<string, Store>();

  scoped(namespace: string): IScopedStorage {
    // 懒创建 electron-store 实例
    if (!this.instances.has(namespace)) {
      this.instances.set(
        namespace,
        new Store({
          name: namespace,
          cwd: path.join(os.homedir(), ".neovate-desktop"),
        }),
      );
    }
    return new ScopedStorage(this.instances.get(namespace)!);
  }

  dispose(): void {
    this.instances.clear();
  }
}

class ScopedStorage implements IScopedStorage {
  constructor(private store: Store) {}

  get<T = unknown>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    if (value === undefined) {
      this.store.delete(key);
    } else {
      this.store.set(key, value);
    }
  }

  getAll(): Record<string, unknown> {
    return this.store.store as Record<string, unknown>;
  }
}
```

## Main 侧 — SettingsService（挂 IMainApp）

基于 StorageService 封装，读写 config.json 的 `settings` 字段。插件通过 `ctx.app.settings.scoped("git")` 访问。

```typescript
// main/core/settings-service.ts

interface ISettingsService {
  scoped(namespace: string): IScopedSettings;
}

interface IScopedSettings {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  getAll(): Record<string, unknown>;
}

class SettingsService implements ISettingsService {
  private configStore: IScopedStorage;

  constructor(storageService: IStorageService) {
    this.configStore = storageService.scoped("config");
  }

  scoped(namespace: string): IScopedSettings {
    return new ScopedSettings(this.configStore, namespace);
  }
}

class ScopedSettings implements IScopedSettings {
  constructor(
    private configStore: IScopedStorage,
    private namespace: string,
  ) {}

  get<T = unknown>(key: string): T | undefined {
    return this.configStore.get<T>(`settings.${this.namespace}.${key}`);
  }

  set(key: string, value: unknown): void {
    this.configStore.set(`settings.${this.namespace}.${key}`, value);
  }

  getAll(): Record<string, unknown> {
    return this.configStore.get<Record<string, unknown>>(`settings.${this.namespace}`) ?? {};
  }
}
```

## IMainApp + PluginContext

```typescript
// main/core/types.ts
interface IMainApp {
  readonly subscriptions: { push(...disposables: Disposable[]): void };
  readonly windowManager: IBrowserWindowManager;
  readonly settings: ISettingsService; // 新增，app 级共享能力
}

// main/core/plugin/types.ts
interface PluginContext {
  app: IMainApp;
  orpcServer: typeof os;
  storage: IScopedStorage; // 后续，插件专属（已绑定 plugin-{pluginName}）
}
```

```typescript
// MainApp 实现
class MainApp implements IMainApp {
  private storageService: StorageService; // 内部完整版
  readonly settings: ISettingsService;

  constructor() {
    this.storageService = new StorageService();
    this.settings = new SettingsService(this.storageService);
  }

  // 后续：给插件创建受限 storage
  createPluginStorage(pluginName: string): IScopedStorage {
    return this.storageService.scoped(`plugin-data/${pluginName}`);
  }
}
```

```typescript
// PluginManager 构造 ctx（MVP 不含 storage）
const ctx: PluginContext = {
  app: mainApp,
  orpcServer: os,
  // storage: mainApp.createPluginStorage(plugin.name),  // 后续
};
```

## 插件用法

```typescript
// git plugin 示例
activate(ctx) {
  // settings — config.json → settings.git.*
  const s = ctx.app.settings.scoped("git");
  const autoFetch = s.get<boolean>("autoFetch") ?? true;
  s.set("autoFetch", false);

  // storage（后续）— plugin-data/git.json（插件专属）
  // ctx.storage.set("lastFetch", Date.now());
}
```

## 插件迁移 — 自行处理

与 VSCode/Obsidian 一致，插件在 `activate()` 自行迁移。

```typescript
activate(ctx) {
  const s = ctx.app.settings.scoped("git");
  const v = s.get<number>("_v") ?? 0;
  if (v < 1) {
    const old = s.get<boolean>("auto_fetch");
    if (old !== undefined) {
      s.set("autoFetch", old);
      s.set("auto_fetch", undefined);
    }
    s.set("_v", 1);
  }
}
```

## ORPC Contract

```typescript
// shared/features/storage/contract.ts
export const storageContract = {
  // 通用 storage RPC
  get: oc.input(z.object({ ns: z.string(), key: z.string() })).output(type<unknown>()),
  set: oc
    .input(z.object({ ns: z.string(), key: z.string(), value: z.unknown() }))
    .output(type<void>()),
  getAll: oc.input(z.object({ ns: z.string() })).output(type<Record<string, unknown>>()),

  // settings 便捷 RPC（读写 config.json → settings.*）
  settings: {
    getAll: oc.output(type<Record<string, unknown>>()),
    get: oc.input(z.object({ key: z.string() })).output(type<unknown>()),
    set: oc.input(z.object({ key: z.string(), value: z.unknown() })).output(type<void>()),
  },
};
```

## Renderer 侧 — Settings（Zustand 缓存 + 响应式）

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

- `fetch()`: mount 时调一次，从 main 拉 settings 全量
- `set()`: 乐观更新内存，同时 ORPC 调 main 写盘
- `get()`: 从内存读，可能返回 `undefined`，调用方兜底默认值

### RendererSettingsService（挂 IRendererApp）

```typescript
interface IRendererSettingsService {
  scoped(namespace: string): IScopedRendererSettings;
}

interface IScopedRendererSettings {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): Promise<void>;
  getAll(): Record<string, unknown>;
  subscribe(listener: (data: Record<string, unknown>) => void): () => void;
}
```

## Renderer 侧 — Storage（纯 RPC，不缓存）

```typescript
interface IScopedRendererStorage {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
}
```

### Renderer IRendererApp + PluginContext

```typescript
interface IRendererApp {
  readonly settings: IRendererSettingsService; // 挂 app
}

interface RendererPluginContext {
  app: IRendererApp;
  orpcClient: Record<string, unknown>;
  storage: IScopedRendererStorage; // 后续，挂 ctx，已绑定 plugin-{pluginName}
}
```

### Renderer 插件用法

```typescript
activate(ctx) {
  // settings（Zustand 缓存，响应式）
  const s = ctx.app.settings.scoped("git");
  const autoFetch = s.get<boolean>("autoFetch") ?? true;
  s.subscribe((data) => { /* UI 更新 */ });

  // storage（后续，纯 RPC）
  // const lastFetch = await ctx.storage.get("lastFetch");
}
```

## 启动流程

```
MainApp.constructor()
  → new StorageService()
  → new SettingsService(storageService)

MainApp.start()
  → pluginManager.configContributions(ctx)
  → pluginManager.activate(ctx)              // 插件可读写 settings
  → buildRouter()
  → createMainWindow()

Renderer mount
  → client.storage.settings.getAll()         // ORPC 拉 settings
  → Zustand store 缓存
```

## 迁移策略（渐进式）

**MVP 阶段：**

- 新建 StorageService + SettingsService
- ConfigStore 暂时保留，config.json 里新增 `settings` 字段
- 现有 `config.theme` 不动

**后续迁移：**

1. `config.theme` → `settings.preferences.theme`，删除 ConfigStore
2. ProjectStore 内部改为委托 StorageService，删除 ProjectStore
3. BrowserWindowManager 内部改用 StorageService

## 约束

- `get()` 可能返回 `undefined`，调用方负责兜底默认值
- `set(key, undefined)` 语义为删除该 key
- 插件 settings 无编译期类型安全，插件自行断言类型
- 内置 preferences 可定义静态类型
- 插件迁移在 `activate()` 自行处理（`_v` 版本号）
- 通用 storage RPC 需要权限控制：Renderer 插件只能访问 `plugin-{name}` namespace

## 变更事件（后续）

MVP 不实现，预留方向：

```typescript
// Main 侧
interface IScopedSettings {
  onDidChange(
    listener: (e: { key: string; value: unknown; previousValue: unknown }) => void,
  ): Unsubscribe;
}
```

Renderer 侧 MVP 已支持 `subscribe`（基于 Zustand subscribe）。
