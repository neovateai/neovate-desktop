# useFileData 深度分析

## 概述

`useFileData` 是一个用于管理文件树数据的 React Hook，采用**扁平化数据结构**设计，将传统树形结构转换为线性数组管理，换取更灵活的节点更新能力。

---

## 核心设计理念

### 扁平化 vs 树形结构

```
传统树形结构:              扁平化结构:
root/                      [
  ├── src/                   { fullPath: "root/src", isFolder: true, parentPath: "root" },
  │   ├── components/        { fullPath: "root/src/components", isFolder: true, parentPath: "root/src" },
  │   └── utils.ts           { fullPath: "root/src/utils.ts", isFolder: false, parentPath: "root/src" },
  └── package.json           { fullPath: "root/package.json", isFolder: false, parentPath: "root" },
]
```

**优势：**

- 避免深层递归遍历和复杂 merge 操作
- O(n) 时间复杂度查找、过滤、更新节点
- 状态更新更直观，直接操作数组

---

## 核心状态

| 状态           | 类型                      | 说明                        |
| -------------- | ------------------------- | --------------------------- |
| `nodes`        | `FileNodeItem[]`          | 所有已加载的文件/文件夹节点 |
| `expandedKeys` | `Set<string>`             | 已展开的目录路径集合        |
| `selectedKeys` | `Set<string>`             | 选中的节点路径集合          |
| `renamingKey`  | `string`                  | 正在重命名的节点路径        |
| `watchersRef`  | `Map<string, () => void>` | 路径 → 取消监听函数的映射   |

### 双重引用模式：`nodes` + `nodesRef`

```typescript
const [nodes, setNodes] = useState<FileNodeItem[]>([]);
const nodesRef = useRef<FileNodeItem[]>([]);
nodesRef.current = nodes; // 保持同步
```

**为什么需要两个引用？**

1. **`nodes` (React State)**: 驱动 UI 重新渲染
2. **`nodesRef` (Mutable Ref)**: 在回调和异步操作中访问**最新**数据

**典型使用场景：**

```typescript
const toggleExpand = (key: string) => {
  // 在闭包中使用 nodesRef 获取最新节点数据
  // 如果直接用 nodes，可能拿到的是过期闭包中的旧数据
  const subKeys = getSubKeys(
    key,
    nodesRef.current.map((i) => i.fullPath),
  );
  // ...
};
```

在 `doLoad` 回调、`toggleExpand` 等函数中，如果直接使用 `nodes`，由于闭包机制，可能访问到的是函数创建时的旧状态。`nodesRef` 始终指向最新数据，确保操作正确性。

---

## FileNodeItem 数据结构

```typescript
interface FileNodeItem {
  fullPath: string; // 完整绝对路径
  relPath: string; // 相对路径
  fileName: string; // 文件名
  isFolder: boolean; // 是否为文件夹
  parentPath: string; // 父目录路径
}
```

---

## 核心方法详解

### 1. `toggleExpand(key: string)` - 展开/折叠目录

**折叠时 (preExpanded = true) - 级联清理：**

1. 从 `expandedKeys` 移除当前 key
2. 查找所有以该路径开头的子节点 (`getSubKeys`)
3. **级联取消监听**: 不仅取消当前目录，还取消所有子孙目录的监听
4. 从 `nodes` 中移除所有子节点数据（保留当前目录作为"桩"）

**展开时 (preExpanded = false):**

1. 添加 key 到 `expandedKeys`
2. 找出该目录下所有曾经展开过的子目录
3. 调用 `doLoad` 批量加载这些目录的数据

```
流程示意:
折叠 /root/src
    ↓
getSubKeys('/root/src') → ['/root/src/components', '/root/src/utils.ts', ...]
    ↓
keysToUnwatch = ['/root/src', '/root/src/components', ...] (含子孙)
    ↓
逐个取消监听并清除 watchersRef
    ↓
nodes.filter(node => !subKeys.includes(node.fullPath))

展开 /root/src
    ↓
查找 expandedKeys 中以 /root/src 开头的子目录
    ↓
doLoad(['/root/src', '/root/src/components', ...])
    ↓
为每个加载的目录启动 watch 监听
```

**级联清理的意义：**

折叠 `/root/src` 时，如果 `/root/src/components` 曾经展开过且正在监听，必须一并取消监听并清理数据。否则会造成内存泄漏和状态不一致。

---

### 2. `updateNodeDir(dir, files)` - 更新目录内容

用于接收 `doLoad` 的返回数据，更新指定目录的子节点：

1. **数据合并**: 过滤掉该目录下旧的子节点，添加新的子节点
2. **启动监听**: 如果提供了 `watch` 函数且该目录未被监听，则启动监听

```typescript
const updateNodeDir = (dir: string, files: Omit<FileNodeItem, "parentPath">[]) => {
  const subItems = files.map((i) => ({ ...i, parentPath: dir }));
  setNodes((prev) => {
    const updated = prev.filter((i) => i.parentPath !== dir);
    return [...updated, ...subItems];
  });
  // 启动监听...
};
```

---

### 3. `focus(key: string)` - 聚焦并选中文件

用于外部跳转/定位到某个文件（如点击搜索结果、点击编辑器 tab），采用**"目录发现 + 快照恢复"**策略确保树状态一致性：

**执行流程：**

```
focus(key)
    ↓
检查目标是否已加载？(nodesRef.current.find)
    ↓ 是 → 直接调用 select(key, true) 选中并滚动
    ↓ 否 → 进入目录发现流程
    ↓
获取当前监听状态快照 (watchersRef.current.keys)
    ↓
收集从 cwd 到目标的所有父目录 (getParentKeys)
    ↓
标记所有父目录为展开状态 (expandedKeys.add)
    ↓
找出这些父目录下曾经展开过的子目录 (getSubKeys)
    ↓
批量加载所有缺失的目录数据 (doLoad)
    ↓
数据加载完成后，调用 select(key, true) 选中并滚动到视图中心
```

**关键实现细节：**

```typescript
const focus = useCallback(
  async (key: string) => {
    // 1. 已加载？直接选中并滚动
    const target = nodesRef.current.find((i) => i.fullPath === key);
    if (target) {
      select(target.fullPath, true);
      return;
    }

    // 2. 获取当前展开状态引用（注意：getKeys() 返回的是当前 Set 的引用，需可靠使用）
    const preExpandedKeys = expandedKeys.getKeys();

    // 3. 收集从 cwd 到目标的所有父目录
    const parentKeys = getParentKeys(cwd, key);

    // 4. 找出需要加载的目录（未被监听的）
    const loadedSet = new Set(watchersRef.current.keys());
    const dirsToLoad: string[] = [];
    const allExpandedDirs: string[] = []; // 记录所有被强制展开的目录

    for (const parentKey of parentKeys) {
      if (!loadedSet.has(parentKey)) {
        dirsToLoad.push(parentKey);
      }
      expandedKeys.add(parentKey);
      allExpandedDirs.push(parentKey);
    }

    // 5. 目标文件的直接父目录也需要展开
    const immediateParent = key.split("/").slice(0, -1).join("/");
    if (!loadedSet.has(immediateParent)) {
      dirsToLoad.push(immediateParent);
    }
    expandedKeys.add(immediateParent);
    allExpandedDirs.push(immediateParent);

    // 6. 恢复历史展开状态：为每个展开的目录检查是否有历史展开的子目录
    for (const dir of allExpandedDirs) {
      const subKeys = getSubKeys(dir, [...preExpandedKeys]);
      for (const subKey of subKeys) {
        if (!loadedSet.has(subKey) && !dirsToLoad.includes(subKey)) {
          dirsToLoad.push(subKey);
        }
      }
    }

    // 7. 批量加载并选中
    if (dirsToLoad.length > 0) {
      await doLoad(dirsToLoad, nodesRef.current);
      select(key, true);
    }
  },
  [cwd, select, expandedKeys, doLoad],
);
```

**为什么需要快照恢复？**

假设用户之前展开过 `/project/src/components`，然后折叠了 `/project/src`。当用户通过搜索结果定位到 `/project/src/components/Button.tsx` 时：

1. `focus` 需要展开 `/project/src`
2. 按照用户之前的操作习惯，`/project/src/components` 也应该保持展开
3. 通过 `preExpandedKeys` 引用查询 `/project/src/components` 曾经展开过
4. 因此它会被加入 `dirsToLoad`，确保用户看到熟悉的树结构

**注意：** `getKeys()` 返回的是 `keysRef.current` 的引用，不是副本。如果需要真正的快照副本，应该使用 `new Set(expandedKeys.getKeys())` 或 `[...expandedKeys.getKeys()]`。

---

### `select(filepath, scroll)` - 选中节点

用于选中单个文件/文件夹节点：

```typescript
const select = useCallback(
  (filepath: string, scroll = false) => {
    selectedKeys.only(filepath); // 单选模式
    if (scroll) {
      // 在下一帧滚动到选中节点（确保 DOM 已更新）
      requestAnimationFrame(() => {
        const node = document.querySelector(`[data-full-path="${filepath}"]`);
        if (node) {
          node.scrollIntoView({ block: "center" });
        }
      });
    }
  },
  [selectedKeys],
);
```

**参数说明：**

- `filepath`: 目标节点的完整路径
- `scroll`: 是否滚动到视图中心（默认 false）

### doLoad 的递归父目录收集策略

`files-view.tsx` 中的 `doLoad` 实现展示了与 `useFileData` 的配合设计：

```typescript
const doLoad = async (dirs: string[], currentNodes: FileNodeItem[]) => {
  const allDirsToLoad = new Set<string>(dirs);

  // 递归向上收集缺失的父目录
  const collectMissingParents = (dirPath: string) => {
    const lastSlash = dirPath.lastIndexOf("/");
    if (lastSlash === -1) return;
    const parentDir = dirPath.substring(0, lastSlash);
    if (!parentDir || !parentDir.startsWith(cwd)) return;
    const exists = currentNodes.some((n) => n.fullPath === parentDir);
    if (exists) return;
    allDirsToLoad.add(parentDir);
    collectMissingParents(parentDir); // 递归向上
  };

  for (const dir of dirs) {
    collectMissingParents(dir);
  }

  // 按深度排序（浅层优先）
  const sortedDirs = Array.from(allDirsToLoad).sort((a, b) => {
    const depthA = a.split("/").length;
    const depthB = b.split("/").length;
    return depthA - depthB;
  });

  await Promise.allSettled(sortedDirs.map((i) => fetchChildren(i)));
};
```

**设计要点：**

1. **递归向上**: `collectMissingParents` 递归查找所有缺失的祖先，直到遇到已存在的节点或超出 `cwd`
2. **深度排序**: 浅层目录先加载，确保父数据先于子数据就绪
3. **并行加载**: 使用 `Promise.allSettled` 批量并发请求
4. **容错**: `allSettled` 确保单个目录加载失败不会影响其他目录

在 `focus` 执行过程中会不断修改 `expandedKeys`，而我们需要知道**调用前**哪些目录是展开的。使用 `preExpandedKeys` 快照确保不会遗漏历史展开的子目录，同时避免递归查找时的状态紊乱。

---

### 4. `renameEffect(preKey, newKey)` - 重命名副作用处理

文件重命名成功后同步更新状态和监听器：

**状态迁移：**

- 更新 `selectedKeys` (如果旧 key 被选中)
- 更新 `expandedKeys` (如果旧 key 被展开)
- 清空 `renamingKey`

**监听器迁移（关键）：**

- 停止旧路径的监听 (`unwatch()`)
- 删除 `watchersRef` 中的旧条目
- 为新路径启动新的监听

```typescript
const unwatch = watchersRef.current.get(preKey);
if (unwatch) {
  unwatch(); // 停止旧监听
  watchersRef.current.delete(preKey); // 删除旧条目
  if (watch) {
    watchersRef.current.set(newKey, watch(newKey)); // 启动新监听
  }
}
```

**为什么需要迁移监听器：**

文件重命名后，原路径不再存在，文件系统 watcher 对该路径的监听将失效。必须为新路径重新建立监听，否则后续对该路径下文件变更的监听将丢失。

**注意：** 此方法只更新状态和监听器，不更新 `nodes` 数据，需要外部调用 `updateNodeDir` 刷新文件列表数据。

---

## FileTreeContext - 跨组件状态共享

`FileTreeContext` 提供了一种让子组件（如 `TreeNode`）访问树状态的方式，避免层层传递 props。

```typescript
export const FileTreeContext = createContext<IFileTreeContext>({
  nodes: [],
  expandedKeys: new Set(),
  selectedKeys: new Set(),
  renamingKey: "",
});
```

**在 `files-view.tsx` 中提供 Context：**

```typescript
<FileTreeContext.Provider
  value={{
    nodes,
    expandedKeys,
    selectedKeys,
    renameStart,
    renameEnd,
    renamingKey,
  }}
>
  {/* TreeNode 组件树 */}
</FileTreeContext.Provider>
```

**在 `tree-node.tsx` 中使用 Context：**

```typescript
const { nodes, expandedKeys, selectedKeys, renamingKey, renameStart, renameEnd } =
  useContext(FileTreeContext);

// 动态计算子节点，而非通过 props 传递
const childNodes = nodes.filter((i) => i.parentPath === item.fullPath);
```

**设计意图：**

1. **避免 props drilling**: `TreeNode` 递归渲染，如果不使用 Context，每个层级都需要传递大量 props
2. **统一状态源**: 确保所有节点组件访问同一状态引用
3. **动态子节点计算**: 利用扁平化结构的优势，通过 `parentPath` 过滤动态获取子节点

---

## 辅助方法

### `getSubKeys(parentKey, keys)`

获取指定路径下的所有子孙路径（通过字符串前缀匹配）。

```typescript
getSubKeys("/root/src", ["/root/src/a", "/root/src/b", "/root/package.json"]);
// 返回: ['/root/src/a', '/root/src/b']
```

### `getParentKeys(cwd, targetKey)`

获取从 `cwd` 到目标路径的所有父目录。

```typescript
getParentKeys("/root", "/root/src/components/Button.tsx");
// 返回: ['/root/src', '/root/src/components']
```

---

## 状态清理策略

### 节点删除时 (`removeNode`)

仅清理状态 (`expandedKeys`, `selectedKeys`)，不直接操作 `nodes`。`nodes` 的更新由外部通过 `updateNodeDir` 完成。

### 重置 (`reset`)

- 清空所有节点数据
- 清空展开状态
- 取消所有文件监听

### 自动清理缺失节点的选中 (useEffect)

当 `nodes` 更新时，自动移除 `selectedKeys` 中指向已不存在节点的 key，避免选中状态悬空：

```typescript
useEffect(() => {
  const nodePaths = new Set(nodes.map((n) => n.fullPath)); // O(n) 构建 Set
  for (const key of selectedKeys.keys) {
    if (!nodePaths.has(key)) {
      // O(1) 查找
      selectedKeys.remove(key);
    }
  }
}, [nodes]);
```

**性能优化：**

- 使用 `Set` 将查找复杂度从 O(n²) 降级为 O(n)
- 在 `nodes` 变化时自动清理，而非在删除操作时立即处理，保持关注点分离

---

## 与 useOperationKeys 的关系

依赖 `useOperationKeys` 管理 `Set` 类型的状态。为何不直接使用 `useState<Set<string>>`？

**直接使用 useState 的问题：**

```typescript
// ❌ 错误：Set 是可变对象，引用不变时 React 不会重新渲染
const [expandedKeys, setExpandedKeys] = useState(new Set());
expandedKeys.add("/project/src"); // 直接修改，不会触发渲染
setExpandedKeys(expandedKeys); // 引用相同，React 忽略更新
```

**useOperationKeys 的解决方案：**

```typescript
const add = useCallback((key: string) => {
  setKeys((prev) => {
    if (prev.has(key)) return prev; // 避免不必要的更新
    const next = new Set(prev); // 创建新 Set
    next.add(key);
    keysRef.current = next; // 同步更新 ref
    return next; // 新引用触发渲染
  });
}, []);
```

### API 参考

| 方法                 | 说明                                                   |
| -------------------- | ------------------------------------------------------ |
| `keys`               | 当前集合的只读引用（用于渲染）                         |
| `has(key)`           | 检查 key 是否存在（通过 ref，O(1)）                    |
| `add(key)`           | 添加 key（创建新 Set 触发渲染）                        |
| `remove(key, deep?)` | 移除 key，`deep=true` 时级联移除子孙                   |
| `replace(old, new)`  | 原子替换 key，用于重命名时保持状态                     |
| `only(key)`          | 只保留一个 key，用于单选                               |
| `getKeys()`          | 返回 keys Set 的当前引用（不是快照副本，迭代时需注意） |
| `reset()`            | 清空集合                                               |

### 为什么需要 `keysRef`？

与 `nodesRef` 类似，`useOperationKeys` 内部也维护了一个 `keysRef`，用于在闭包中获取最新的集合状态：

```typescript
const has = useCallback((key: string) => {
  return keysRef.current.has(key); // 始终访问最新状态
}, []);
```

这在 `getKeys()` 中尤为重要，确保获取快照时不依赖可能过期的闭包变量。

### 根节点渲染策略

扁平化结构下，树形关系通过 `parentPath` 隐式表达。渲染时只需过滤出直接子节点：

```typescript
// files-view.tsx 中
const rootLevelNodes = nodes.filter((i) => i.parentPath === cwd);

return (
  <div className="space-y-1">
    {rootLevelNodes.map((item) => (
      <TreeNode key={item.fullPath} item={item} level={0} ... />
    ))}
  </div>
);
```

`TreeNode` 组件内部递归渲染时，同样通过 `parentPath === item.fullPath` 找出子节点。这种设计避免了递归构建树形数据结构，渲染时动态计算父子关系。

---

## useFileData 与 files-view.tsx 的协作模式

`useFileData` 是**纯数据管理 hook**，不涉及副作用（如 API 调用、文件监听）。`files-view.tsx` 作为父组件，负责注入具体的副作用逻辑。

### 分离设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        FilesView (父组件)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   useFileData (Hook)                     │    │
│  │  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐   │    │
│  │  │  nodes   │  │ expandedKeys │  │  selectedKeys   │   │    │
│  │  └──────────┘  └──────────────┘  └─────────────────┘   │    │
│  │  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐   │    │
│  │  │  reset   │  │toggleExpand  │  │      focus      │   │    │
│  │  └──────────┘  └──────────────┘  └─────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                     │
│         ┌─────────────────┼─────────────────┐                   │
│         ↓                 ↓                 ↓                   │
│  ┌────────────┐    ┌────────────┐   ┌─────────────┐           │
│  │ startWatcher│    │ fetchChildren│   │  doLoad      │           │
│  │ (文件监听)  │    │ (API 请求)   │   │ (批量加载)   │           │
│  └────────────┘    └────────────┘   └─────────────┘           │
│                           │                                     │
│                           ↓                                     │
│                     updateNodeDir(dir, files)                   │
│                     (将数据回填到 useFileData)                   │
└─────────────────────────────────────────────────────────────────┘
```

### 初始化调用示例

```typescript
// files-view.tsx
const {
  nodes,
  expandedKeys,
  selectedKeys,
  toggleExpand,
  updateNodeDir,
  // ...
} = useFileData({
  cwd, // 当前工作目录
  watch: startWatcher, // 注入：启动文件监听的函数
  doLoad: (dirs, nodes) => doLoad(dirs, nodes), // 注入：批量加载数据的函数
});

// 具体的 API 请求在 files-view.tsx 中实现
const fetchChildren = useCallback(
  async (dir: string) => {
    const { tree } = await client.files.tree({ cwd: dir, root: cwd });
    updateNodeDir(dir, tree); // 数据获取后回填
    return tree;
  },
  [cwd, client.files, updateNodeDir],
);
```

### 为什么这样设计？

1. **职责分离**: `useFileData` 专注数据结构和状态流转，`files-view` 专注业务逻辑和副作用
2. **可测试性**: hook 可以独立测试，注入 mock 的 `watch` 和 `doLoad`
3. **可复用性**: 同样的数据管理逻辑可以适配不同的数据源（本地文件、远程文件等）
4. **类型安全**: `doLoad` 接收 `nodes` 参数，确保基于最新状态做决策

---

## 状态分离原则

不同操作对状态和数据的分工明确：

| 操作         | 状态管理 (`expandedKeys`/`selectedKeys`) | 数据管理 (`nodes`)     |
| ------------ | ---------------------------------------- | ---------------------- |
| `removeNode` | 清理选中/展开状态                        | 不操作                 |
| 折叠目录     | 从 `expandedKeys` 移除                   | 清理子节点数据         |
| 文件监听更新 | 无                                       | `updateNodeDir` 更新   |
| `reset`      | 清空所有状态                             | 清空 `nodes`、取消监听 |

**为什么分离状态与数据：**

- `removeNode` 只处理状态是因为实际文件删除后，watcher 会触发更新，调用 `updateNodeDir` 统一刷新数据
- 折叠时直接操作 `nodes` 是为了即时释放内存，而不依赖外部 watcher 回调

```typescript
const {
  nodes,
  expandedKeys,
  selectedKeys,
  toggleExpand,
  updateNodeDir,
  focus,
  // ...
} = useFileData({
  cwd: "/project",
  watch: (dir) => {
    // 返回取消监听函数
    return () => {};
  },
  doLoad: (dirs, latestNodes) => {
    // 异步加载目录内容
    // 完成后调用 updateNodeDir(dir, files)
  },
});
```

---

## 可测试性设计

由于采用**依赖注入**模式，`useFileData` 可以完全独立于真实文件系统进行测试。

### 测试策略

```typescript
// packages/desktop/src/renderer/src/plugins/files/__tests__/useFileData.test.ts

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileData, FileNodeItem } from "../hooks/useFileData";

describe("useFileData", () => {
  // Mock 依赖
  const mockWatch = vi.fn(() => vi.fn()); // 返回取消监听函数
  const mockDoLoad = vi.fn();

  it("should expand folder and call doLoad", () => {
    const { result } = renderHook(() =>
      useFileData({
        cwd: "/project",
        watch: mockWatch,
        doLoad: mockDoLoad,
      }),
    );

    act(() => {
      result.current.toggleExpand("/project/src");
    });

    expect(result.current.expandedKeys.has("/project/src")).toBe(true);
    expect(mockDoLoad).toHaveBeenCalledWith(["/project/src"], []);
  });
});
```

### 测试覆盖范围

> bun vitest run src/renderer/src/plugins/files/**tests**/useFileData.test.ts

测试文件涵盖以下场景：

| 测试组           | 覆盖内容                                   |
| ---------------- | ------------------------------------------ |
| `initialization` | 初始状态、reset 行为                       |
| `toggleExpand`   | 展开/折叠、级联取消监听、子目录加载        |
| `updateNodeDir`  | 数据更新、watch 启动、重复更新防护         |
| `selection`      | 单选、取消选择、自动清理失效选中           |
| `renameEffect`   | 状态迁移、监听器迁移                       |
| `focus`          | 现有节点直接选中、父目录展开、历史状态恢复 |
| `edge cases`     | 空目录、特殊字符路径、快速操作、深层嵌套   |

### 关键测试技巧

**1. 验证级联取消监听**

```typescript
const unwatchParent = vi.fn();
const unwatchChild = vi.fn();
mockWatch.mockReturnValueOnce(unwatchParent).mockReturnValueOnce(unwatchChild);

// ... 展开父目录，添加子目录，再折叠父目录 ...

expect(unwatchParent).toHaveBeenCalled();
expect(unwatchChild).toHaveBeenCalled();
```

**2. 验证快照恢复机制**

```typescript
// 先展开子目录
act(() => result.current.toggleExpand("/project/src/utils"));

// 折叠父目录
act(() => result.current.toggleExpand("/project/src"));

// 再次展开父目录时，应该加载之前的子目录
mockDoLoad.mockClear();
act(() => result.current.toggleExpand("/project/src"));

const loadedDirs = mockDoLoad.mock.calls[0][0];
expect(loadedDirs).toContain("/project/src/utils");
```

**3. 测试 `updateNodeDir` 不重复启动 watcher**

```typescript
act(() => {
  result.current.updateNodeDir("/project/src", files);
  result.current.updateNodeDir("/project/src", files);
});

expect(mockWatch).toHaveBeenCalledTimes(1);
```

### 运行测试

```bash
# 运行特定测试文件（目前 vitest 配置有问题，需要修复后运行）
bun test:run packages/desktop/src/renderer/src/plugins/files/__tests__/useFileData.test.ts
```

---

## 乐观更新与状态回滚

在 `tree-node.tsx` 中，`rename` 操作采用**乐观 UI** 策略提升用户体验：

```typescript
const handleFinishRename = async () => {
  if (editingName && editingName !== fileName && onRename) {
    // 1. 乐观更新：立即显示新名称
    setPendingFileName(editingName);
    renameEnd?.(); // 退出编辑模式

    // 2. 异步请求
    const result = await onRename(item.fullPath, newPath);

    // 3. 失败回滚：如果 rename 失败，恢复旧名称
    if (result === false) {
      setPendingFileName(null);
    }
  }
};
```

**显示优先级:** `pendingFileName || fileName`

- 正常情况：watcher 检测到文件变化 → 更新 `nodes` → `fileName` 更新 → `pendingFileName` 被清除
- 失败情况：`result === false` → 立即清除 `pendingFileName` → 恢复原名称

这种模式让用户感受到即时响应，同时保证数据一致性。

---

## 设计亮点

1. **单一数据源**: `nodesRef` 与 `nodes` 同步，确保回调中访问最新数据
2. **按需加载**: 只加载展开过的目录，折叠时清理无关节点
3. **智能聚焦**: `focus` 方法采用**快照机制**处理从根到目标的所有缺失数据，同时恢复历史展开的子目录状态
4. **监听管理**: `watchersRef` 精确追踪哪些路径正在被监听，折叠时**级联清理**子孙节点避免内存泄漏
5. **状态隔离**: 删除操作只清理状态，数据更新由 `updateNodeDir` 或文件监听统一处理
6. **性能优化**: `Set` 构建 + O(1) 查找优化选中状态清理；`requestAnimationFrame` 确保 DOM 渲染后滚动
7. **深度排序加载**: `doLoad` 递归收集缺失父目录并按深度排序，确保父先于子加载
8. **父子解耦**: 通过 `FileTreeContext` 和动态子节点计算，避免递归传递 props
9. **副作用注入**: `watch` 和 `doLoad` 由父组件注入，hook 保持纯数据管理
10. **乐观更新**: TreeNode 内实现乐观 UI + 失败回滚机制
