import { oc, type, eventIterator } from "@orpc/contract";

export interface FileTreeItem {
  fullPath: string;
  relPath: string;
  fileName: string;
  isFolder: boolean;
  children: FileTreeItem[];
}

export const fileErrorCodes = ["already_exists", "path_required", "not_found", "unknown"] as const;
export type FileErrorCode = (typeof fileErrorCodes)[number];

export interface FileSystemOperation {
  success: boolean;
  error?: string;
  errorCode?: FileErrorCode;
}

export interface FileWatchEvent {
  type: "add" | "unlink" | "addDir" | "unlinkDir" | "content";
  path: string;
  timestamp: number;
}

export const filesContract = {
  tree: oc.input(type<{ cwd: string; root?: string }>()).output(type<{ tree: FileTreeItem[] }>()),
  delete: oc.input(type<{ path: string }>()).output(type<{ success: boolean; error?: string }>()),
  rename: oc
    .input(type<{ oldPath: string; newPath: string }>())
    .output(type<{ success: boolean; error?: string }>()),
  createFolder: oc.input(type<{ path: string }>()).output(type<FileSystemOperation>()),
  createFile: oc.input(type<{ path: string }>()).output(type<FileSystemOperation>()),
  watch: oc.input(type<{ cwd: string }>()).output(eventIterator(type<FileWatchEvent>())),
};
