import debug from "debug";
import fs from "node:fs";
import path from "node:path";

import { getExcludePatterns } from "./utils/ignore";

const log = debug("neovate:files:tree");

export interface FileTreeNode {
  fileName: string;
  fullPath: string;
  isFolder: boolean;
  children?: FileTreeNode[];
  relPath: string;
  languageId?: string;
}

/**
 * List immediate children of a directory (single-level, no recursion).
 * Use `projectRoot` to share cached exclude patterns across calls.
 */
export async function listDirectory(dir: string, projectRoot?: string): Promise<FileTreeNode[]> {
  const root = projectRoot || dir;
  log("listing directory", { dir, root });

  const excludePatterns = await getExcludePatterns(root);

  try {
    const entries = await fs.promises.readdir(dir);
    const nodes: FileTreeNode[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");

      const isExcluded = excludePatterns.some((pattern) => {
        // simple glob matching for common patterns
        if (pattern.startsWith("**/")) {
          const suffix = pattern.slice(3);
          if (relativePath === suffix || relativePath.endsWith(`/${suffix}`)) return true;
          if (suffix.endsWith("/**")) {
            const prefix = suffix.slice(0, -3);
            if (relativePath === prefix || relativePath.startsWith(`${prefix}/`)) return true;
          }
        }
        if (pattern === relativePath) return true;
        return false;
      });

      if (isExcluded) continue;

      try {
        const stats = await fs.promises.stat(fullPath);
        const isFolder = stats.isDirectory();
        const node: FileTreeNode = {
          fileName: entry,
          fullPath,
          relPath: relativePath,
          isFolder,
          children: isFolder ? [] : undefined,
        };

        if (!isFolder) {
          node.languageId = entry.split(".").pop();
        }

        nodes.push(node);
      } catch (error) {
        log("error processing entry", { path: fullPath, error });
      }
    }

    return nodes.sort(compareNodes);
  } catch (error) {
    log("error reading directory", { path: dir, error });
    return [];
  }
}

function compareNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.isFolder && !b.isFolder) return -1;
  if (!a.isFolder && b.isFolder) return 1;
  return a.fileName.toLowerCase().localeCompare(b.fileName.toLowerCase());
}
