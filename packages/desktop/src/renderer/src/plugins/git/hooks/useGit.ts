import type { ContractRouterClient } from "@orpc/contract";

import debug from "debug";
import { useState } from "react";

const log = debug("neovate:git");

import type { GitFile } from "../../../../../shared/plugins/git/contract";

import { llmContract } from "../../../../../shared/features/llm/contract";
import { utilsContract } from "../../../../../shared/features/utils/contract";
import { gitContract } from "../../../../../shared/plugins/git/contract";
import { usePluginContext } from "../../../core/app";
import { GIT_COMMIT_MSG_PROMPT, GIT_COMMIT_MSG_PROMPT_SUFFIX } from "./commit-rule";
import { truncateDiff } from "./truncate";

export type Client = ContractRouterClient<{
  git: typeof gitContract;
  utils: typeof utilsContract;
  llm: typeof llmContract;
}>;

export function useGit(cwd: string) {
  const { orpcClient } = usePluginContext();
  const client = orpcClient as Client;

  const [workingFiles, setWorkingFiles] = useState<GitFile[]>([]);
  const [stagedFiles, setStagedFiles] = useState<GitFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [commitStatus, setCommitStatus] = useState<
    "idle" | "committing" | "pushing" | "generating"
  >("idle");

  const refreshGitStatus = async (workingDir: string, withLoading = true) => {
    log("refreshGitStatus", { workingDir, withLoading });
    if (withLoading) {
      setLoading(true);
    }
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
    log("clearStaged", { count: stagedFiles.length });
    setLoading(true);
    try {
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
    log("revertAll", {
      workingCount: workingFiles.length,
      stagedCount: stagedFiles.length,
    });
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
    log("revert", { relPath: file.relPath, status: file.status });
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
    log("add2stage", { relPath: file.relPath });
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
    log("removeFromStage", { relPath: file.relPath });
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
    log("stageAll", { count: workingFiles.length });
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

  const genCommitMsg = async () => {
    if (!cwd) return;
    log("genCommitMsg", { cwd });
    setCommitStatus("generating");
    let result = "";
    let error = "";
    try {
      const rawDiff = await getRawDiff();
      if (!rawDiff) {
        throw new Error("Diff content not found");
      }
      // 截断过长的 diff 内容，避免超出 LLM token 限制
      const truncatedDiff = truncateDiff(rawDiff);
      if (truncatedDiff !== rawDiff) {
        log("genCommitMsg: diff truncated", {
          originalLength: rawDiff.length,
          truncatedLength: truncatedDiff.length,
        });
      }
      const res = await client.llm.query({
        prompt: [GIT_COMMIT_MSG_PROMPT, truncatedDiff, GIT_COMMIT_MSG_PROMPT_SUFFIX].join("------"),
      });
      result = res?.content || "";
    } catch (_e) {
      error = _e instanceof Error ? _e?.message : (_e as string);
    } finally {
      setCommitStatus("idle");
    }
    return { success: !!result, result, error };
  };

  const getRawDiff = async () => {
    if (!cwd) {
      throw new Error("Cwd is needed");
    }
    const res = await client.git.cachedDiff({ cwd });
    if (!res.success) {
      throw new Error("Failed to get raw diff:" + res.error);
    }
    return res.data ?? "";
  };

  const commit = async (message: string, shouldPush = false) => {
    if (!cwd || !message.trim()) {
      return {
        commit: false,
        push: false,
        needsUpstream: false,
        branch: "",
        error: `cwd and message is needed`,
      };
    }
    log("commit", { message, shouldPush });
    setCommitStatus("committing");
    const results = {
      commit: true,
      push: true,
      error: "",
      needsUpstream: false,
      branch: "",
    };

    try {
      const res = await client.git.commit({ cwd, message: message.trim() });
      if (!res.success) {
        results.commit = false;
        results.push = false;
        results.error = res.error || "Unknown error";
        console.error("Failed to commit:", res.error);
        return results;
      }
      if (shouldPush) {
        setCommitStatus("pushing");
        // 先检查是否有上游分支
        const upstreamInfo = await checkUpstream();
        if (!upstreamInfo?.hasUpstream) {
          results.needsUpstream = true;
          results.branch = upstreamInfo?.branch ?? "";
          results.push = false;
          await refreshGitStatus(cwd);
          return results;
        }
        const pushRes = await client.git.push({ cwd });
        if (!pushRes.success) {
          results.push = false;
          results.error = pushRes.error || "Unknown error";
          console.error("Failed to push:", pushRes.error);
        }
      }
      await refreshGitStatus(cwd);
    } catch (_e) {
      results.commit = false;
      results.push = false;
      results.error = _e instanceof Error ? _e?.message : (_e as string);
      console.error("Failed to commit:", results.error);
    } finally {
      setCommitStatus("idle");
    }
    return results;
  };

  const checkUpstream = async () => {
    if (!cwd) return null;
    const res = await client.git.branches({ cwd });
    if (!res.success || !res.data) return null;
    const currentBranch = res.data.branches.find((b) => b.current);
    return {
      branch: currentBranch?.name ?? res.data.current,
      hasUpstream: !!currentBranch?.tracking,
    };
  };

  const push = async (setUpstream = false) => {
    if (!cwd) return { success: false, error: "" };
    log("push", { setUpstream });
    setLoading(true);
    try {
      const res = await client.git.push({ cwd, setUpstream });
      if (!res.success) {
        console.error("Failed to push:", res.error);
        return { success: false, error: res.error || "Unknown error" };
      }
      return { success: true, error: "" };
    } catch (error) {
      console.error("Failed to push:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    commitStatus,
    workingFiles,
    stagedFiles,
    refreshGitStatus,
    clearStaged,
    revertAll,
    stageAll,
    add2stage,
    removeFromStage,
    revert,
    commit,
    push,
    genCommitMsg,
  };
}
