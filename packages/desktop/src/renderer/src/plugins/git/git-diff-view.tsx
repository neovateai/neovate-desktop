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

interface TruncatedDiffData extends DiffData {
  isTruncated: boolean;
  totalLineCount: number;
  visibleLineCount: number;
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
  const [truncatedDiffData, setTruncatedDiffData] = useState<TruncatedDiffData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffStyle, setDiffStyle] = useState<DiffStyle>("unified");
  const [visibleLineLimit, setVisibleLineLimit] = useState(500);
  const [isExpanding, setIsExpanding] = useState(false);

  const oldFile = {
    name: truncatedDiffData?.fileName || "",
    contents: truncatedDiffData?.oldContent || "",
  };
  const newFile = {
    name: truncatedDiffData?.fileName || "",
    contents: truncatedDiffData?.newContent || "",
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

  useEffect(() => {
    if (diffData) {
      const truncated = createTruncatedDiffData(diffData, visibleLineLimit);
      setTruncatedDiffData(truncated);
    }
  }, [diffData, visibleLineLimit]);

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

        const fullData = {
          oldContent: diff.data.oldContent || "",
          newContent: diff.data.newContent || "",
          fileName,
          fileStatus: diff.data.fileStatus || "",
        };

        setDiffData(fullData);
        setVisibleLineLimit(500); // Reset limit for new file

        // Create truncated version
        const truncated = createTruncatedDiffData(fullData, 500);
        setTruncatedDiffData(truncated);
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

  const countLines = (content: string): number => {
    if (!content || content.length === 0) return 0;
    return content.split("\n").length || 0;
  };

  const truncateContent = (
    content: string,
    linesLimit: number,
  ): { truncated: string; totalLines: number; isTruncated: boolean } => {
    if (!content || content.length === 0) {
      return { truncated: "", totalLines: 0, isTruncated: false };
    }

    const lines = content.split("\n");
    const totalLines = lines.length;

    if (totalLines <= linesLimit) {
      return { truncated: content, totalLines, isTruncated: false };
    }

    const truncatedText = lines.slice(0, linesLimit).join("\n");
    return { truncated: truncatedText, totalLines, isTruncated: true };
  };

  const createTruncatedDiffData = (originalData: DiffData, limit: number): TruncatedDiffData => {
    const oldLineCount = originalData.oldContent ? countLines(originalData.oldContent) : 0;
    const newLineCount = originalData.newContent ? countLines(originalData.newContent) : 0;
    const maxLineCount = Math.max(oldLineCount, newLineCount);

    const oldTruncated = truncateContent(originalData.oldContent || "", limit);
    const newTruncated = truncateContent(originalData.newContent || "", limit);

    return {
      ...originalData,
      oldContent: oldTruncated.truncated,
      newContent: newTruncated.truncated,
      isTruncated: oldTruncated.isTruncated || newTruncated.isTruncated,
      totalLineCount: maxLineCount,
      visibleLineCount: Math.min(limit, maxLineCount),
    };
  };

  const handleShowMore = async () => {
    if (!diffData) return;

    setIsExpanding(true);

    // Use a small delay to allow UI to update
    setTimeout(() => {
      setVisibleLineLimit((prev) => prev + 500);
      setIsExpanding(false);
    }, 50);
  };

  const handleShowAll = () => {
    if (!diffData) return;
    setVisibleLineLimit(Infinity);
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

        {truncatedDiffData?.isTruncated && (
          <div className="flex items-center justify-center p-4 border-t bg-background/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="text-sm text-muted-foreground">
                {t("git.diff.showingLines", {
                  current: truncatedDiffData.visibleLineCount,
                  total: truncatedDiffData.totalLineCount,
                })}
              </div>

              {isExpanding ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-muted-foreground">{t("git.diff.loadingMore")}</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleShowMore}
                    className="px-3 py-1.5 text-sm bg-primary/10 text-primary hover:bg-primary/20 rounded-md transition-colors"
                  >
                    {t("git.diff.showMore", {
                      count: Math.min(
                        500,
                        truncatedDiffData.totalLineCount - truncatedDiffData.visibleLineCount,
                      ),
                    })}
                  </button>

                  {truncatedDiffData.totalLineCount - truncatedDiffData.visibleLineCount > 1000 && (
                    <button
                      onClick={handleShowAll}
                      className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                    >
                      {t("git.diff.showAll")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
