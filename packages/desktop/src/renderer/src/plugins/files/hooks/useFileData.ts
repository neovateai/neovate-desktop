import { createContext, useCallback, useEffect, useRef, useState } from "react";

import { useOperationKeys } from "./useOperationKeys";

export interface FileNodeItem {
  fullPath: string;
  relPath: string;
  fileName: string;
  isFolder: boolean;
  parentPath: string;
}
interface IUseFileTreeOpts {
  cwd: string;
  /** 处理文件监听的方法 */
  watch?: (dir: string) => () => void;
  /** 批量加载数据 */
  doLoad: (dirs: string[], latestNodes: FileNodeItem[]) => Promise<void> | void;
}

interface IFileTreeContext {
  /** 已经加载的文件/文件夹节点 */
  nodes: FileNodeItem[];
  expandedKeys: Set<string>;
  selectedKeys: Set<string>;
  /** 正在重命名的key */
  renamingKey: string;
  renameStart?: (key: string) => void;
  renameEnd?: () => void;
  pendingCreation: { type: "file" | "folder"; parentPath: string } | null;
  createStart?: (type: "file" | "folder", parentPath: string) => void;
  createEnd?: () => void;
}

export const FileTreeContext = createContext<IFileTreeContext>({
  nodes: [],
  expandedKeys: new Set(),
  selectedKeys: new Set(),
  renamingKey: "",
  pendingCreation: null,
});
/**
 * 使用扁平化结构管理文件树数据以换取更灵活的节点更新能力，避免复杂tree节点数据的merge 和 update
 */
export function useFileData(opts: IUseFileTreeOpts) {
  const { watch, doLoad, cwd } = opts || {};

  const watchersRef = useRef<Map<string, () => void>>(new Map());
  const expandedKeys = useOperationKeys(); // dirs expanded or ever expanded
  const selectedKeys = useOperationKeys(); // dirs expanded or ever expanded
  const [renamingKey, setRenamingKey] = useState("");
  const [pendingCreation, setPendingCreation] = useState<IFileTreeContext["pendingCreation"]>(null);
  const [nodes, setNodes] = useState<FileNodeItem[]>([]);
  const nodesRef = useRef<FileNodeItem[]>([]);
  nodesRef.current = nodes;

  // 避免selectKeys 指向不存在的节点
  useEffect(() => {
    const nodePaths = new Set(nodes.map((n) => n.fullPath));
    for (const key of selectedKeys.keys) {
      if (!nodePaths.has(key)) {
        selectedKeys.remove(key);
      }
    }
  }, [nodes, selectedKeys.keys]);

  const toggleExpand = (key: string) => {
    const preExpanded = expandedKeys.has(key);
    // 关闭节点
    if (preExpanded) {
      expandedKeys.remove(key);

      // 在当前节点中，找到fullPath start with key 的节点，即所有关闭目录下属节点
      const subKeys = getSubKeys(
        key,
        nodesRef.current.map((i) => i.fullPath),
      );
      const keysToUnwatch = [...new Set([key, ...subKeys])];
      // 取消关闭节点以及其下属目录节点的监听
      for (const i of keysToUnwatch) {
        const unwatch = watchersRef.current.get(i);
        if (unwatch) {
          unwatch(); // 如果是文件节点可能是没有监听器的
          watchersRef.current.delete(i);
        }
      }
      // 移除子节点数据
      const nextNodes = nodesRef.current.filter((i) => !subKeys.includes(i.fullPath));
      setNodes(nextNodes);
    } else {
      expand(key);
    }
  };
  const expand = useCallback(
    (key: string) => {
      if (expandedKeys.has(key)) {
        return;
      }
      // 打开节点，当前节点以及历史打开的子目录节点，进行数据加载
      expandedKeys.add(key);
      // 下属曾经打开的节点也要重新加载数据
      const subKeys = getSubKeys(key, [...expandedKeys.keys]);
      const keysToLoad = [...new Set([key, ...subKeys])];
      doLoad(keysToLoad, nodesRef.current);
    },
    [expandedKeys, doLoad],
  );
  /** 插入特定目录下的子节点数据，并启动对该目录的监听 */
  const updateNodeDir = useCallback(
    (dir: string, files: Omit<FileNodeItem, "parentPath">[]) => {
      const subItems = files.map((i) => ({ ...i, parentPath: dir }));
      setNodes((prev) => {
        const updated = prev.filter((i) => i.parentPath !== dir);
        return [...updated, ...subItems];
      });
      // 合入数据，并开始监听
      if (watch) {
        const target = watchersRef.current.get(dir);
        if (!target) {
          const unwatch = watch(dir);
          watchersRef.current.set(dir, unwatch);
        }
      }
    },
    [watch],
  );
  /** 清理某个节点带来的状态，用于删除节点 */
  const removeNode = (key: string) => {
    if (selectedKeys.has(key)) {
      selectedKeys.remove(key);
    }
    if (expandedKeys.has(key)) {
      expandedKeys.remove(key);
    }
  };

  const select = useCallback(
    (filepath: string, scroll = false) => {
      selectedKeys.only(filepath);
      if (scroll) {
        // Scroll the selected node into view
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
  const cancelSelect = useCallback(() => {
    selectedKeys.reset();
  }, [selectedKeys]);

  const renameStart = useCallback((key: string) => {
    setRenamingKey(key);
  }, []);
  const renameEnd = useCallback(() => {
    setRenamingKey("");
  }, []);

  const createStart = useCallback((type: "file" | "folder", parentPath: string) => {
    setPendingCreation({ type, parentPath });
  }, []);
  const createEnd = useCallback(() => {
    setPendingCreation(null);
  }, []);

  const renameEffect = (preKey: string, newKey: string) => {
    if (selectedKeys.has(preKey)) {
      selectedKeys.replace(preKey, newKey);
    }
    if (expandedKeys.has(preKey)) {
      expandedKeys.replace(preKey, newKey);
    }
    // 重命副作用：清理旧路径监听器，处理新监听器
    const unwatch = watchersRef.current.get(preKey);
    if (unwatch) {
      unwatch();
      watchersRef.current.delete(preKey);
      if (watch) {
        watchersRef.current.set(newKey, watch(newKey));
      }
    }
    setRenamingKey("");
  };

  const focus = useCallback(
    async (key: string) => {
      const target = nodesRef.current.find((i) => i.fullPath === key);
      if (target) {
        select(target.fullPath, true);
        return;
      }
      // focus 目标文件不存在，获取从 cwd 到目标的所有上级目录
      const parentKeys = getParentKeys(cwd, key);
      // 找到第一个未加载的父目录（从根开始）
      const loadedKeys = Array.from(watchersRef.current.keys());
      const loadedSet = new Set(loadedKeys);
      const dirsToLoad: string[] = [];
      const allExpandedDirs: string[] = []; // 记录所有被强制展开的目录
      const preExpandedKeys = expandedKeys.getKeys();
      for (const parentKey of parentKeys) {
        if (!loadedSet.has(parentKey)) {
          dirsToLoad.push(parentKey);
        }
        expandedKeys.add(parentKey);
        allExpandedDirs.push(parentKey);
      }
      // 目标文件的直接父目录
      const immediateParent = key.split("/").slice(0, -1).join("/");
      if (!loadedSet.has(immediateParent)) {
        dirsToLoad.push(immediateParent);
      }
      expandedKeys.add(immediateParent);
      allExpandedDirs.push(immediateParent);
      // 加载所有未加载的父目录，以及这些父目录下已经展开的子节点
      for (const dir of allExpandedDirs) {
        const subKeys = getSubKeys(dir, [...preExpandedKeys]);
        for (const subKey of subKeys) {
          if (!loadedSet.has(subKey) && !dirsToLoad.includes(subKey)) {
            dirsToLoad.push(subKey);
          }
        }
      }

      if (dirsToLoad.length > 0) {
        await doLoad(dirsToLoad, nodesRef.current);
        select(key, true);
      }
    },
    [cwd, select, expandedKeys, doLoad],
  );

  const reset = () => {
    setNodes([]);
    expandedKeys.reset();
    for (const cancel of watchersRef.current.values()) {
      cancel();
    }
    watchersRef.current.clear();
  };

  return {
    updateNodeDir,
    nodes,
    toggleExpand,
    expand,
    expandedKeys: expandedKeys.keys,
    selectedKeys: selectedKeys.keys,
    renamingKey,
    pendingCreation,
    reset,
    select,
    cancelSelect,
    removeNode,
    /** 开始重命名状态 */
    renameStart,
    /** 结束重命名状态 */
    renameEnd,
    /** 开始创建文件/文件夹状态 */
    createStart,
    /** 结束创建文件/文件夹状态 */
    createEnd,
    /** 重命名成功后，处理伴生副作用 */
    renameEffect,
    /** 聚焦选中 */
    focus,
  };
}

function getSubKeys(parentKey: string, keys: string[]) {
  const descendants: string[] = [];
  for (const key of keys) {
    if (key.startsWith(parentKey + "/")) {
      descendants.push(key);
    }
  }
  return descendants;
}

function getParentKeys(cwd: string, targetKey: string) {
  const parents: string[] = [];
  // 确保 targetKey 以 cwd 开头
  if (!targetKey.startsWith(cwd)) {
    return parents;
  }
  // 获取 cwd 之后的相对路径部分
  const relativePart = targetKey.slice(cwd.length);
  if (!relativePart || relativePart === "/") {
    return parents;
  }
  // 去掉开头的斜杠
  const cleanRelative = relativePart.startsWith("/") ? relativePart.slice(1) : relativePart;
  // 获取最后一级的父路径（不含文件名/最后一级）
  const segments = cleanRelative.split("/");
  // 从 cwd 开始，逐级构建父路径
  let currentPath = cwd;
  // 只取到倒数第二级（最后一级是目标本身）
  for (let i = 0; i < segments.length - 1; i++) {
    currentPath = currentPath + "/" + segments[i];
    parents.push(currentPath);
  }
  return parents;
}
