import { MultiFileDiff } from "@pierre/diffs/react";
import { File, GitBranch } from "lucide-react";
import { useTheme } from "next-themes";
import { memo, useEffect, useState } from "react";

import { usePluginContext } from "../../core/app";
import { useProjectStore } from "../../features/project/store";
import { Client } from "./hooks/useGit";
import { useGitTranslation } from "./i18n";

interface DiffData {
  oldContent: string;
  newContent: string;
  fileName: string;
}

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
        return res.data;
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

    setLoading(true);
    setError(null);

    try {
      const diff = await getFileDiff(relPath, type);
      if (diff) {
        const fileName = relPath.split("/").pop() || relPath;

        setDiffData({
          oldContent: diff.oldContent || "",
          newContent: diff.newContent || "",
          fileName,
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

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 overflow-auto">
        {diffData.oldContent === "" && diffData.newContent === "" ? (
          <div className="h-full flex flex-col items-center justify-center">
            <GitBranch className="w-12 h-12 text-success mb-4" />
            <p className="text-sm text-success font-medium">{t("git.diff.fileAdded")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("git.diff.newFile")}</p>
          </div>
        ) : diffData.newContent === "" ? (
          <div className="h-full flex flex-col items-center justify-center">
            <GitBranch className="w-12 h-12 text-destructive mb-4" />
            <p className="text-sm text-destructive font-medium">{t("git.diff.fileDeleted")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("git.diff.deletedFile")}</p>
          </div>
        ) : (
          <MultiFileDiff
            oldFile={oldFile}
            newFile={newFile}
            options={{
              theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
              diffStyle: "split",
            }}
          />
        )}
      </div>
    </div>
  );
});
