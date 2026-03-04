# Storage & Settings Module Design

## 问题

当前存储层存在以下问题：

1. **electron-store 实例分散** — ProjectStore、ConfigStore、BrowserWindowManager 各自 `new Store()`，`cwd` 等配置重复，没有统一管理
2. **插件没有持久化能力** — 插件想存数据没有 API
3. **没有 settings 基础设施** — 用户设置没有统一的读写机制
4. **Renderer 没有通用存储 RPC** — 每个 feature 各写一套 contract + router + Zustand store

## Overview

统一的存储基础设施，提供两层能力：

- **StorageService**（main/core）— 通用 KV 存储引擎，管理多个 electron-store 实例（每个 namespace 一个 JSON 文件），解决问题 1、2、4
- **Storage RPC**（shared + main/features）— 通用 ORPC 接口，Renderer 通过 `client.storage.get/set/getAll` 访问任意 namespace
- **SettingsService**（renderer/features）— 基于 Storage RPC 封装，Zustand 缓存 + optimistic update，专门管理 config.json 的 `settings` 字段，解决问题 3

## 决策记录

- **存储引擎**: electron-store，每个 namespace 一个 JSON 文件，懒创建
- **存储位置**: `~/.neovate-desktop/`（与现有一致）
- **写盘策略**: MVP 每次 set 直接写盘
- **settings 存储**: 放在 config.json 的 `settings` 字段下，按 namespace key 隔离
- **插件 storage**（后续）: 每个插件独立文件（`~/.neovate-desktop/plugin-data/{pluginName}.json`），PluginManager 预绑定前缀，MVP 不实现
- **Main 插件 settings**: MVP 不提供，后续按需添加
- **Renderer settings**: SettingsService 在 features 层封装，接口在 core/types.ts 定义
- **Storage RPC**: 通用 KV 接口，不区分 settings 还是其他数据
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
    "git": { "autoFetch": true }
  }
}
```

- 现有 `theme` 字段暂时保留（渐进迁移到 `settings.preferences.theme`）
- `settings` 字段下按 namespace 隔离

## 代码布局

```
main/core/
  storage-service.ts       # StorageService — 管理 electron-store 实例
  types.ts                 # IMainApp

main/features/storage/
  router.ts                # 通用 storage ORPC handlers

shared/features/storage/
  contract.ts              # ORPC contract（通用 KV）
  types.ts                 # Preferences 类型

renderer/src/core/
  types.ts                 # IRendererApp（含 ISettingsService 接口）

renderer/src/features/settings/
  settings-service.ts      # SettingsService 实现
  store.ts                 # Zustand store
  hooks/use-settings.ts
  index.ts
```

## Main 侧 — StorageService（core 基础设施）

管理多个 electron-store 实例，按 namespace 懒创建。支持子目录 namespace（如 `plugin-data/git`）。

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
    // 懒创建，支持子目录（plugin-data/git → cwd: BASE_DIR/plugin-data, name: git）
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

  // 暴露给 AppContext（router 用），不在 IMainApp 上
  getStorage(): StorageService {
    return this.storage;
  }
}
```

## ORPC Contract — 通用 KV

```typescript
// shared/features/storage/contract.ts
export const storageContract = {
  get: oc
    .input(z.object({ namespace: z.string(), key: z.string() }))
    .output(type<unknown>()),
  set: oc
    .input(z.object({ namespace: z.string(), key: z.string(), value: z.unknown() }))
    .output(type<void>()),
  getAll: oc
    .input(z.object({ namespace: z.string() }))
    .output(type<Record<string, unknown>>()),
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

## Renderer 侧 — SettingsService（features 层）

接口定义在 `core/types.ts`，实现在 `features/settings/`。基于 Zustand store 缓存 + Storage RPC。

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

- `fetch()`: mount 时调一次，从 main 拉 `config` namespace 的 `settings` 字段
- `set()`: 乐观更新内存，同时通过 Storage RPC 写盘
- `get()`: 从内存读，可能返回 `undefined`，调用方兜底默认值

### SettingsService 实现

```typescript
// renderer/src/features/settings/settings-service.ts
class SettingsService implements ISettingsService {
  scoped(namespace: string): IScopedSettings {
    return new ScopedSettings(namespace);
  }
}

// ScopedSettings 内部自动拼 namespace 前缀，委托给 Zustand store
```

### Renderer 插件用法

```typescript
activate(ctx) {
  const s = ctx.app.settings.scoped("git");
  const autoFetch = s.get<boolean>("autoFetch") ?? true;
  s.subscribe((data) => { /* UI 更新 */ });
}
```

## 启动流程

```
MainApp.constructor()
  → new StorageService()

MainApp.start()
  → pluginManager.configContributions(ctx)
  → pluginManager.activate(ctx)
  → buildRouter()
  → createMainWindow()

Renderer mount
  → client.storage.getAll({ namespace: "config" })  // 拉 config 全量
  → 提取 settings 字段 → Zustand store 缓存
```

## 迁移策略（渐进式）

**MVP 阶段：**

- 新建 StorageService + 通用 Storage RPC
- Renderer SettingsService 封装 settings 读写
- ConfigStore 暂时保留，config.json 里新增 `settings` 字段
- 现有 `config.theme` 不动

**后续迁移：**

1. `config.theme` → `settings.preferences.theme`，删除 ConfigStore
2. ProjectStore 内部改为委托 StorageService，删除 ProjectStore
3. BrowserWindowManager 内部改用 StorageService
4. Main 插件 settings API（按需）
5. 插件专属 storage（`ctx.storage`）

## 约束

- `get()` 可能返回 `undefined`，调用方负责兜底默认值
- 插件 settings 无编译期类型安全，插件自行断言类型
- 内置 preferences 可定义静态类型
- 通用 storage RPC 需要权限控制（后续）：Renderer 插件只能访问 `plugin-{name}` namespace

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
