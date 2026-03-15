import { MultiFileDiff } from "@pierre/diffs/react";
import debug from "debug";
import { Columns2, AlignJustify, File, FilePlus, GitBranch, GitCommit } from "lucide-react";
import { useTheme } from "next-themes";
import { memo, useEffect, useState } from "react";

const log = debug("neovate:git:diff");

import { usePluginContext } from "../../core/app";
import { useProjectStore } from "../../features/project/store";
import { Client } from "./hooks/useGit";
import { useGitTranslation } from "./i18n";

interface DiffData {
  oldContent: string;
  newContent: string;
  fileName: string;
  fileStatus?: string;
}

type DiffStyle = "unified" | "split";

export default memo(function GitDiffView() {
  const { t } = useGitTranslation();
  const activeProject = useProjectStore((s) => s.activeProject);
  const cwd = activeProject?.path || "";
  const { orpcClient } = usePluginContext();
  const client = orpcClient as Client;
  const { resolvedTheme } = useTheme();

  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffStyle, setDiffStyle] = useState<DiffStyle>("unified");

  const oldFile = {
    name: diffData?.fileName || "",
    contents: diffData?.oldContent || "",
  };
  const newFile = {
    name: diffData?.fileName || "",
    contents: diffData?.newContent || "",
  };

  useEffect(() => {
    const handleOpenGitDiff = (e: Event) => {
      const { relPath = "", isStaged = false } =
        (e as CustomEvent<{ relPath: string; isStaged: boolean }>)?.detail || {};
      if (relPath) {
        log("handleOpenGitDiff", { relPath, isStaged });
        setCurrentFilePath(relPath);
        loadDiff(relPath, isStaged ? "staged" : "working");
      }
    };

    window.addEventListener("neovate:open-git-diff", handleOpenGitDiff);
    return () => {
      window.removeEventListener("neovate:open-git-diff", handleOpenGitDiff);
    };
  }, [cwd]);

  const getFileDiff = async (file: string, type: "working" | "staged") => {
    try {
      const res = await client.git.diff({ cwd, file, type });
      if (res.success && res.data) {
        return res;
      } else {
        console.error(`Failed to get diff for file ${file}:`, res.error);
        return null;
      }
    } catch (error) {
      console.error(`Error getting diff for file ${file}:`, error);
      return null;
    }
  };

  const loadDiff = async (relPath: string, type: "working" | "staged") => {
    if (!cwd) return;
    log("loadDiff", { relPath, type });
    setLoading(true);
    setError(null);

    try {
      const diff = await getFileDiff(relPath, type);

      if (diff && diff.data) {
        const fileName = relPath.split("/").pop() || relPath;

        setDiffData({
          oldContent: diff.data.oldContent || "",
          newContent: diff.data.newContent || "",
          fileName,
          fileStatus: diff.data.fileStatus || "",
        });
      } else {
        setError(t("git.diff.loadFailed"));
      }
    } catch (err) {
      console.error("Failed to load diff:", err);
      setError(t("git.diff.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const toggleDiffStyle = () => {
    setDiffStyle((prev) => (prev === "split" ? "unified" : "split"));
  };

  if (!currentFilePath) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background">
        <GitBranch className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">{t("git.diff.selectFile")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm text-muted-foreground">{t("git.diff.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background">
        <File className="w-12 h-12 text-destructive mb-4" />
        <p className="text-sm text-destructive mb-2">{t("git.diff.error")}</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!diffData) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background">
        <File className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">{t("git.diff.noChanges")}</p>
      </div>
    );
  }

  const hasOldContent = diffData.oldContent && diffData.oldContent.trim().length > 0;
  const hasNewContent = diffData.newContent && diffData.newContent.trim().length > 0;
  const isNewFile = !hasOldContent && hasNewContent;
  const isDeletedFile = hasOldContent && !hasNewContent;

  // 区分新文件的类型：未跟踪还是已暂存的
  const isUntracked = diffData.fileStatus === "untracked";

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0">
        <div className="flex-1" />

        {/* Diff style toggle */}
        <button
          onClick={toggleDiffStyle}
          className="p-1 hover:bg-accent rounded"
          title={diffStyle === "split" ? "Unified view" : "Split view"}
        >
          {diffStyle === "split" ? (
            <AlignJustify className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <Columns2 className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {isNewFile ? (
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 border-b ${
            isUntracked
              ? "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"
              : "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800"
          }`}
        >
          {isUntracked ? (
            <FilePlus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          ) : (
            <GitCommit className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          <span
            className={`text-xs font-medium ${
              isUntracked
                ? "text-blue-700 dark:text-blue-300"
                : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {isUntracked ? t("git.diff.fileUntracked") : t("git.diff.fileAdded")}
          </span>
        </div>
      ) : isDeletedFile ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-800">
          <GitBranch className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          <span className="text-xs text-rose-700 dark:text-rose-300 font-medium">
            {t("git.diff.fileDeleted")}
          </span>
        </div>
      ) : null}
      <div className="flex-1 overflow-auto">
        {isNewFile ? (
          <MultiFileDiff
            oldFile={{ name: "(empty)", contents: "" }}
            newFile={newFile}
            options={{
              theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
              diffStyle,
            }}
          />
        ) : isDeletedFile ? (
          <MultiFileDiff
            oldFile={oldFile}
            newFile={{ name: "(empty)", contents: "" }}
            options={{
              theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
              diffStyle,
            }}
          />
        ) : (
          <MultiFileDiff
            oldFile={oldFile}
            newFile={newFile}
            options={{
              theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
              diffStyle,
            }}
          />
        )}
      </div>
    </div>
  );
});
