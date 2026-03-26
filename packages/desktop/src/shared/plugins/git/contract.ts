import { oc, type } from "@orpc/contract";

export interface GitFile {
  fullPath: string;
  relPath: string;
  fileName: string;
  extName: string;
  status: "modified" | "deleted" | "untracked" | "added";
  staged?: boolean;
  insertions?: number;
  deletions?: number;
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

export interface GitBranch {
  name: string;
  current: boolean;
  tracking?: string;
  ahead?: number;
  behind?: number;
  lastCommitTimestamp?: number;
}

export interface GitBranchesResponse {
  success: boolean;
  data?: {
    current: string | null;
    detachedHead?: string;
    branches: GitBranch[];
  };
  error?: string;
}

export interface GitCheckoutBranchResponse {
  success: boolean;
  data?: { stashed: boolean; stashPopFailed?: boolean };
  error?: string;
}

export interface GitCreateBranchResponse {
  success: boolean;
  data?: { name: string };
  error?: string;
}

export interface GitBranchFile {
  relPath: string;
  fileName: string;
  extName: string;
  status: "added" | "modified" | "deleted";
  insertions?: number;
  deletions?: number;
}

export interface GitBranchFilesResponse {
  success: boolean;
  data?: {
    local: string;
    tracking: string;
    ahead: number;
    behind: number;
    files: GitBranchFile[];
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
  branches: oc
    .input(type<{ cwd: string; search?: string; limit?: number }>())
    .output(type<GitBranchesResponse>()),
  checkoutBranch: oc
    .input(type<{ cwd: string; branch: string }>())
    .output(type<GitCheckoutBranchResponse>()),
  createBranch: oc
    .input(type<{ cwd: string; name: string }>())
    .output(type<GitCreateBranchResponse>()),
  branchFiles: oc.input(type<{ cwd: string }>()).output(type<GitBranchFilesResponse>()),
  branchFileDiff: oc.input(type<{ cwd: string; file: string }>()).output(type<GitDiffResponse>()),
};
