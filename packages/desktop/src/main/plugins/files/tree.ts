import debug from "debug";
import { minimatch } from "minimatch";
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

export async function getFileTree(parent: string, root?: string): Promise<FileTreeNode[]> {
  const includePatterns: string[] = [];
  const actualRoot = root || parent;
  if (!root) log("building file tree", { root: actualRoot });

  const excludePatterns = await getExcludePatterns(actualRoot);

  const dirFilePath = parent;
  const tree: FileTreeNode[] = [];

  try {
    const files = await fs.promises.readdir(dirFilePath);

    // process files in parallel with Promise.all
    const filePromises = files.map(async (file) => {
      const filePath = path.join(dirFilePath, file);

      try {
        const stats = await fs.promises.stat(filePath);
        const relativePath = path.relative(actualRoot, filePath).replace(/\\/g, "/");

        const isExcluded = excludePatterns.some((pattern) => minimatch(relativePath, pattern));

        if (isExcluded) {
          return null;
        }

        const isFolder = stats.isDirectory();
        const node: FileTreeNode = {
          fileName: file,
          fullPath: filePath,
          relPath: relativePath,
          isFolder,
        };

        if (!isFolder) {
          const isIncluded =
            includePatterns.length === 0 ||
            includePatterns.some((pattern) => minimatch(relativePath, pattern));
          if (!isIncluded) return null;
          node.languageId = file.split(".").pop();
        } else {
          node.children = await getFileTree(filePath, actualRoot);
        }

        if (node.isFolder && (!node.children || node.children.length === 0)) {
          return null;
        }

        return node;
      } catch (error) {
        // handle individual file errors to avoid failing the entire tree build
        log("error processing file", { path: filePath, error });
        return null;
      }
    });
    const results = await Promise.all(filePromises);
    tree.push(...(results.filter(Boolean) as FileTreeNode[]));
  } catch (error) {
    log("error reading directory", { path: dirFilePath, error });
    return [];
  }

  const compareNodes = (a: FileTreeNode, b: FileTreeNode): number => {
    // folders first
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;

    // sort by file name (case-insensitive)
    return a.fileName.toLowerCase().localeCompare(b.fileName.toLowerCase());
  };

  const sortFileTree = (nodes: FileTreeNode[]): FileTreeNode[] => {
    if (!nodes || !Array.isArray(nodes)) {
      return [];
    }

    return nodes.sort(compareNodes).map((node) => ({
      ...node,
      children: node.children && node.children.length > 0 ? sortFileTree(node.children) : [],
    }));
  };

  return sortFileTree(tree);
}
