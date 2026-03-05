import { oc, type } from "@orpc/contract";

export interface GitFile {
  fullPath: string;
  relPath: string;
  fileName: string;
  extName: string;
  status: "modified" | "deleted" | "untracked" | "added";
  staged?: boolean;
}

export interface GitStatus {
  branch: string | null;
  ahead: number;
  behind: number;
  changed: number;
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

export const gitContract = {
  status: oc.output(type<GitStatus>()),
  files: oc.input(type<{ cwd: string }>()).output(type<GitFilesResponse>()),
  add: oc.input(type<{ cwd: string; files: string[] }>()).output(type<GitOperationResponse>()),
  reset: oc.input(type<{ cwd: string; files: string[] }>()).output(type<GitOperationResponse>()),
  checkout: oc.input(type<{ cwd: string; files: string[] }>()).output(type<GitOperationResponse>()),
};
