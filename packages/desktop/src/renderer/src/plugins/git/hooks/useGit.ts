import type { ContractRouterClient } from "@orpc/contract";

import { useState } from "react";

import type { GitFile } from "../../../../../shared/plugins/git/contract";

import { utilsContract } from "../../../../../shared/features/utils/contract";
import { gitContract } from "../../../../../shared/plugins/git/contract";
import { usePluginContext } from "../../../core/app";

export type Client = ContractRouterClient<{
  git: typeof gitContract;
  utils: typeof utilsContract;
}>;

export function useGit(cwd: string) {
  const { orpcClient } = usePluginContext();
  const client = orpcClient as Client;

  const [workingFiles, setWorkingFiles] = useState<GitFile[]>([]);
  const [stagedFiles, setStagedFiles] = useState<GitFile[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshGitStatus = async (workingDir: string) => {
    setLoading(true);
    try {
      const res = await client.git.files({ cwd: workingDir });
      if (res.success && res.data) {
        setWorkingFiles(res.data.working);
        setStagedFiles(res.data.staged);
        return res;
      } else {
        console.error("Failed to fetch git files:", res.error);
        setWorkingFiles([]);
        setStagedFiles([]);
        return res;
      }
    } finally {
      setLoading(false);
    }
  };

  const clearStaged = async () => {
    if (!cwd || stagedFiles.length === 0) return;

    setLoading(true);
    try {
      console.log("Clearing staged files:", stagedFiles);
      const res = await client.git.reset({
        cwd,
        files: stagedFiles.map((f) => f.relPath),
      });

      if (!res.success) {
        console.error("Failed to remove files from stage:", res.error);
      }

      await refreshGitStatus(cwd);
    } catch (error) {
      console.error("Failed to remove all files from stage:", error);
    } finally {
      setLoading(false);
    }
  };

  const revertAll = async () => {
    if (!cwd) return;

    setLoading(true);
    try {
      const allFiles = [...workingFiles, ...stagedFiles];

      // 分离未跟踪文件和已跟踪文件
      const untrackedFiles = allFiles.filter((f) => f.status === "untracked");
      const trackedFiles = allFiles.filter((f) => f.status !== "untracked");

      // 批量还原已跟踪文件
      if (trackedFiles.length > 0) {
        const res = await client.git.checkout({
          cwd,
          files: trackedFiles.map((f) => f.relPath),
        });

        if (!res.success) {
          console.error("Failed to checkout files:", res.error);
        }
      }

      // 批量删除未跟踪文件
      if (untrackedFiles.length > 0) {
        await Promise.allSettled(
          untrackedFiles.map(async (file) => {
            const res = await client.utils.removeFile({ path: file.fullPath });
            if (!res.success) {
              console.error(`Failed to delete untracked file ${file.fullPath}:`, res.error);
            }
          }),
        );
      }

      await refreshGitStatus(cwd);
    } catch (error) {
      console.error("Failed to revert all files:", error);
    } finally {
      setLoading(false);
    }
  };

  const revert = async (file: GitFile) => {
    if (!cwd) return;

    try {
      // 对于已跟踪的文件，使用git checkout还原
      if (file.status !== "untracked") {
        const res = await client.git.checkout({
          cwd,
          files: [file.relPath],
        });

        if (!res.success) {
          console.error(`Failed to revert file ${file.relPath}:`, res.error);
        }
      } else {
        // 对于未跟踪的文件，直接删除
        const res = await client.utils.removeFile({ path: file.fullPath });
        if (!res.success) {
          console.error(`Failed to delete untracked file ${file.fullPath}:`, res.error);
        }
      }

      await refreshGitStatus(cwd);
    } catch (error) {
      console.error("Failed to revert file:", error);
    }
  };

  const add2stage = async (file: GitFile) => {
    if (!cwd) return;

    try {
      const res = await client.git.add({ cwd, files: [file.relPath] });

      if (!res.success) {
        console.error(`Failed to add file ${file.relPath} to stage:`, res.error);
      }
      await refreshGitStatus(cwd);
    } catch (error) {
      console.error("Failed to add file to stage:", error);
    }
  };

  const removeFromStage = async (file: GitFile) => {
    if (!cwd) return;

    try {
      const res = await client.git.reset({ cwd, files: [file.relPath] });

      if (!res.success) {
        console.error(`Failed to remove file ${file.relPath} from stage:`, res.error);
      }

      await refreshGitStatus(cwd);
    } catch (error) {
      console.error("Failed to remove file from stage:", error);
    }
  };

  const stageAll = async () => {
    if (!cwd || workingFiles.length === 0) return;

    setLoading(true);
    try {
      const res = await client.git.add({
        cwd,
        files: workingFiles.map((f) => f.relPath),
      });

      if (!res.success) {
        console.error("Failed to add all files to stage:", res.error);
      }

      await refreshGitStatus(cwd);
    } catch (error) {
      console.error("Failed to add all files to stage:", error);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    workingFiles,
    stagedFiles,
    refreshGitStatus,
    clearStaged,
    revertAll,
    stageAll,
    add2stage,
    removeFromStage,
    revert,
  };
}
