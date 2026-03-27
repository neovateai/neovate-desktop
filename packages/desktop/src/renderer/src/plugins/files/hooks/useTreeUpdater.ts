import { useRef } from "react";

import type { FileTreeItem } from "../../../../../shared/plugins/files/contract";

type TreeUpdate = {
  parentPath: string;
  children: FileTreeItem[];
};

interface UseTreeUpdaterOptions {
  cwd: string;
  setTreeData: React.Dispatch<React.SetStateAction<FileTreeItem[]>>;
}

/**
 * Hook for updating tree data with support for batch updates.
 * Solves the issue where multiple consecutive updates cause unnecessary re-renders.
 */
export function useTreeUpdater({ cwd, setTreeData }: UseTreeUpdaterOptions) {
  // Use ref to keep latest cwd value accessible in setTreeData updater
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  /**
   * Update multiple parent paths with their children in a single render.
   * This is more efficient than calling update() multiple times.
   */
  function batchUpdate(updates: TreeUpdate[]) {
    if (updates.length === 0) return;

    setTreeData((prev) => {
      let result = prev;
      const currentCwd = cwdRef.current;

      for (const { parentPath, children } of updates) {
        // If this is the root, replace top-level
        if (parentPath === currentCwd) {
          result = children;
          continue;
        }

        // Recursively find and update the parent node
        function updateNode(nodes: FileTreeItem[]): FileTreeItem[] {
          return nodes.map((node) => {
            if (node.fullPath === parentPath) {
              return { ...node, children };
            }
            if (node.children && node.children.length > 0) {
              return { ...node, children: updateNode(node.children) };
            }
            return node;
          });
        }

        result = updateNode(result);
      }

      return result;
    });
  }

  /**
   * Update a single parent path with its children.
   * For multiple updates, prefer batchUpdate() for better performance.
   */
  function update(parentPath: string, children: FileTreeItem[]) {
    batchUpdate([{ parentPath, children }]);
  }

  return {
    /** Update a single parent path */
    update,
    /** Update multiple parent paths in a single render */
    batchUpdate,
  };
}
