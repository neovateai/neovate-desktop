import type { ContractRouterClient } from "@orpc/contract";

import { useCallback, useEffect, useRef, useState } from "react";

import type { changesContract } from "../../../../../shared/plugins/changes/contract";
import type { GitFile, GitBranchFile } from "../../../../../shared/plugins/git/contract";
import type { gitContract } from "../../../../../shared/plugins/git/contract";

import { usePluginContext } from "../../../core/app";
import { useProjectStore } from "../../../features/project/store";
import { useActiveSession } from "../../../hooks/useActiveSession";

export type ChangesCategory = "unstaged" | "staged" | "last-turn" | "branch";

export interface ChangesFile {
  relPath: string;
  fileName: string;
  extName: string;
  status: string;
  insertions?: number;
  deletions?: number;
}

export interface FileDiff {
  oldContent: string;
  newContent: string;
}

export interface BranchInfo {
  local: string;
  tracking: string;
  ahead: number;
  behind: number;
}

type Client = ContractRouterClient<{
  git: typeof gitContract;
  changes: typeof changesContract;
}>;

export function useChanges(category: ChangesCategory, opts?: { shouldPoll?: boolean }) {
  const shouldPoll = opts?.shouldPoll ?? false;
  const { orpcClient } = usePluginContext();
  const client = orpcClient as Client;
  const activeProject = useProjectStore((s) => s.activeProject);
  const cwd = activeProject?.path || "";
  const { sessionId } = useActiveSession();

  const [files, setFiles] = useState<ChangesFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);

  // Cache loaded diffs per file
  const [diffs, setDiffs] = useState<Record<string, FileDiff>>({});
  const [loadingDiffs, setLoadingDiffs] = useState<Record<string, boolean>>({});

  // Track current fetch to avoid stale updates
  const fetchIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!cwd) return;

    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    setDiffs({});
    setLoadingDiffs({});
    setBranchInfo(null);

    try {
      if (category === "unstaged" || category === "staged") {
        const res = await client.git.files({ cwd });
        if (fetchId !== fetchIdRef.current) return;
        if (res.success && res.data) {
          const fileList = category === "unstaged" ? res.data.working : res.data.staged;
          setFiles(
            fileList.map((f: GitFile) => ({
              relPath: f.relPath,
              fileName: f.fileName,
              extName: f.extName,
              status: f.status,
              insertions: f.insertions,
              deletions: f.deletions,
            })),
          );
        } else {
          setError(res.error || "Failed to load files");
          setFiles([]);
        }
      } else if (category === "last-turn") {
        if (!sessionId) {
          setError("no_session");
          setFiles([]);
          return;
        }
        const res = await client.changes.lastTurnFiles({ sessionId });
        if (fetchId !== fetchIdRef.current) return;
        if (res.filesChanged && res.filesChanged.length > 0) {
          setFiles(
            res.filesChanged.map((filePath: string) => {
              const relPath =
                cwd && filePath.startsWith(cwd + "/") ? filePath.slice(cwd.length + 1) : filePath;
              const parts = relPath.split("/");
              const fileName = parts[parts.length - 1];
              const extIdx = fileName.lastIndexOf(".");
              return {
                relPath,
                fileName,
                extName: extIdx >= 0 ? fileName.slice(extIdx + 1) : "",
                status: "modified",
              };
            }),
          );
        } else {
          if (res.error) setError(res.error);
          setFiles([]);
        }
      } else if (category === "branch") {
        const res = await client.git.branchFiles({ cwd });
        if (fetchId !== fetchIdRef.current) return;
        if (res.success && res.data) {
          setBranchInfo({
            local: res.data.local,
            tracking: res.data.tracking,
            ahead: res.data.ahead,
            behind: res.data.behind,
          });
          setFiles(
            res.data.files.map((f: GitBranchFile) => ({
              relPath: f.relPath,
              fileName: f.fileName,
              extName: f.extName,
              status: f.status,
              insertions: f.insertions,
              deletions: f.deletions,
            })),
          );
        } else {
          setError(res.error || "Failed to load branch diff");
          setFiles([]);
        }
      }
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : "Unknown error");
      setFiles([]);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [cwd, category, sessionId]);

  // Auto-refresh on category or project change
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll every 2s while streaming and viewing last-turn
  const isRefreshingRef = useRef(false);
  useEffect(() => {
    if (category !== "last-turn" || !shouldPoll) return;
    const id = setInterval(() => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      refresh().finally(() => {
        isRefreshingRef.current = false;
      });
    }, 2000);
    return () => clearInterval(id);
  }, [category, shouldPoll, refresh]);

  // Refresh when a turn completes (any category)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ sessionId: string }>).detail;
      if (detail.sessionId === sessionId) {
        refresh();
      }
    };
    window.addEventListener("neovate:turn-completed", handler);
    return () => window.removeEventListener("neovate:turn-completed", handler);
  }, [sessionId, refresh]);

  const loadDiff = useCallback(
    async (relPath: string) => {
      if (diffs[relPath] || loadingDiffs[relPath]) return;

      setLoadingDiffs((prev) => ({ ...prev, [relPath]: true }));

      try {
        let oldContent = "";
        let newContent = "";

        if (category === "unstaged" || category === "staged") {
          const res = await client.git.diff({
            cwd,
            file: relPath,
            type: category === "staged" ? "staged" : "working",
          });
          if (res.success && res.data) {
            oldContent = res.data.oldContent;
            newContent = res.data.newContent;
          }
        } else if (category === "last-turn") {
          if (!sessionId) return;
          const res = await client.changes.lastTurnDiff({ sessionId, file: relPath });
          if (res.success && res.data) {
            oldContent = res.data.oldContent;
            newContent = res.data.newContent;
          }
        } else if (category === "branch") {
          const res = await client.git.branchFileDiff({ cwd, file: relPath });
          if (res.success && res.data) {
            oldContent = res.data.oldContent;
            newContent = res.data.newContent;
          }
        }

        setDiffs((prev) => ({ ...prev, [relPath]: { oldContent, newContent } }));
      } catch {
        // silently fail — user can retry by collapsing/expanding
      } finally {
        setLoadingDiffs((prev) => ({ ...prev, [relPath]: false }));
      }
    },
    [cwd, category, sessionId, diffs, loadingDiffs],
  );

  return {
    files,
    loading,
    error,
    branchInfo,
    diffs,
    loadingDiffs,
    refresh,
    loadDiff,
  };
}
