import { oc, type } from "@orpc/contract";

export interface GitFile {
  fullPath: string;
  relPath: string;
  fileName: string;
  extName: string;
  status: "modified" | "deleted" | "untracked" | "added";
  staged?: boolean;
}

export interface GitFilesResponse {
  success: boolean;
  data?: {
    working: GitFile[];
    staged: GitFile[];
  };
  error?: string;
}

export interface GitOperationResponse {
  success: boolean;
  data?: {};
  error?: string;
}

export interface GitDiffResponse {
  success: boolean;
  data?: {
    oldContent: string;
    newContent: string;
    fileStatus: string;
  };
  error?: string;
}

export const gitContract = {
  files: oc.input(type<{ cwd: string }>()).output(type<GitFilesResponse>()),
  add: oc.input(type<{ cwd: string; files: string[] }>()).output(type<GitOperationResponse>()),
  reset: oc.input(type<{ cwd: string; files: string[] }>()).output(type<GitOperationResponse>()),
  checkout: oc.input(type<{ cwd: string; files: string[] }>()).output(type<GitOperationResponse>()),
  diff: oc
    .input(type<{ cwd: string; file: string; type: "working" | "staged" }>())
    .output(type<GitDiffResponse>()),
};
