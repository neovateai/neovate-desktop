import type { FileTreeItem } from "../../../../../shared/plugins/files/contract";

/**
 * 缓存树节点信息，避免多次遍历
 */
export interface TreeNodeCache {
  /** 所有存在于树中的节点路径 */
  existingNodes: Set<string>;
  /** 已加载children的节点路径（children存在且有内容） */
  loadedNodes: Set<string>;
}

/**
 * 一次遍历树，构建节点缓存
 */
export function buildTreeNodeCache(tree: FileTreeItem[]): TreeNodeCache {
  const existingNodes = new Set<string>();
  const loadedNodes = new Set<string>();

  function traverse(nodes: FileTreeItem[]) {
    for (const node of nodes) {
      existingNodes.add(node.fullPath);
      if (node.children != null && node.children.length > 0) {
        loadedNodes.add(node.fullPath);
        traverse(node.children);
      }
    }
  }

  traverse(tree);
  return { existingNodes, loadedNodes };
}

/**
 * 准备需要加载的目录列表
 * - 过滤已加载children的目录
 * - 确保父目录完整性
 * - 按深度分组返回
 */
export function prepareDirsToLoad(
  restoreKeys: Set<string>,
  cwd: string,
  cache: TreeNodeCache,
): string[][] {
  const { existingNodes, loadedNodes } = cache;
  const dirsToLoad = new Set<string>();

  // Step 1: 过滤已加载的目录
  for (const dir of restoreKeys) {
    if (!loadedNodes.has(dir)) {
      dirsToLoad.add(dir);
    }
  }

  if (dirsToLoad.size === 0) {
    return [];
  }

  // Step 2: 确保父目录完整（如果父目录不在set中且不在树中，添加它）
  for (const dir of dirsToLoad) {
    let current = dir;
    while (current !== cwd) {
      const parent = current.substring(0, current.lastIndexOf("/"));
      if (parent === cwd) break;
      if (!dirsToLoad.has(parent) && !existingNodes.has(parent)) {
        dirsToLoad.add(parent);
      }
      current = parent;
    }
  }

  // Step 3: 按深度分组，跳过无效路径（父目录既不在set中也不在树中）
  const directoriesByDepth = new Map<number, string[]>();

  for (const path of dirsToLoad) {
    if (path === cwd || !path.startsWith(cwd)) continue;

    const parentPath = path.substring(0, path.lastIndexOf("/"));
    if (parentPath !== cwd && !dirsToLoad.has(parentPath) && !existingNodes.has(parentPath)) {
      continue;
    }
    const depth = path.substring(cwd.length + 1).split("/").length;
    if (!directoriesByDepth.has(depth)) {
      directoriesByDepth.set(depth, []);
    }
    directoriesByDepth.get(depth)!.push(path);
  }

  // 将Map转换为按深度排序的双层数组
  const sortedDepths = Array.from(directoriesByDepth.keys()).sort((a, b) => a - b);
  return sortedDepths.map((depth) => directoriesByDepth.get(depth)!);
}
