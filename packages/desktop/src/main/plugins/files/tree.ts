import { minimatch } from "minimatch";
import fs from "node:fs";
import path from "node:path";

export interface FileTreeNode {
  fileName: string;
  fullPath: string;
  isFolder: boolean;
  children?: FileTreeNode[];
  relPath: string;
  languageId?: string;
}

const EXCLUDE_FILE_TYPE_PATTERN = [
  "**/node_modules",
  "**/node_modules/**",
  /** 编译产物忽略 */
  "**/dist",
  "**/dist/**",
  "**/.*/**",
  "**/.*",
];

function getExcludePatterns(): string[] {
  // const gitignorePatterns = getGitignorePatterns();
  const allPatterns = [...EXCLUDE_FILE_TYPE_PATTERN];
  return [...new Set(allPatterns)];
}

export async function getFileTree(parent: string, root?: string): Promise<FileTreeNode[]> {
  const includePatterns: string[] = [];
  const actualRoot = root || parent;

  const excludePatterns = getExcludePatterns();

  const dirFilePath = parent;
  const tree: FileTreeNode[] = [];

  try {
    const files = await fs.promises.readdir(dirFilePath);

    // 使用 Promise.all 并行处理文件
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
        // 处理单个文件的错误，避免整个树构建失败
        console.warn(`Error processing file ${filePath}:`, error);
        return null;
      }
    });
    const results = await Promise.all(filePromises);
    tree.push(...(results.filter(Boolean) as FileTreeNode[]));
  } catch (error) {
    console.warn(`Error reading directory ${dirFilePath}:`, error);
    return [];
  }

  const compareNodes = (a: FileTreeNode, b: FileTreeNode): number => {
    // 文件夹优先
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;

    // 按文件名排序（忽略大小写）
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
