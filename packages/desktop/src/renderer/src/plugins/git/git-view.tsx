import { memo, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, RefreshCw, Undo2 } from "lucide-react";
import { type GitFile } from "../../../../shared/plugins/git/contract";
import { useGit_v2 as useGit } from "./hooks/useGit";
import { useGitTranslation } from "./i18n";
import { useProjectStore } from "../../features/project/store";

export default memo(function GitView() {
  const { t } = useGitTranslation();
  const activeProject = useProjectStore((s) => s.activeProject);

  const [workingCollapsed, setWorkingCollapsed] = useState(false);
  const [stagedCollapsed, setStagedCollapsed] = useState(false);

  const {
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
  } = useGit(activeProject?.path || "");

  const showDiff = (filePath: string) => {
    console.log("Show diff for file:", filePath);
    // TODO: Implement diff view when ready
  };

  useEffect(() => {
    if (!activeProject?.path) return;
    refreshGitStatus(activeProject.path);
  }, [activeProject?.path]);

  const getFileIcon = (extName: string) => {
    const suffix = extName.startsWith(".") ? extName.slice(1) : extName;
    return (
      <div className="seti-icon" data-lang={suffix.toLowerCase()} style={{ fontSize: 14 }}></div>
    );
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "modified":
        return <span className="text-xs font-medium text-yellow-600">M</span>;
      case "deleted":
        return <span className="text-xs font-medium text-red-600">D</span>;
      case "untracked":
        return <span className="text-xs font-medium text-green-600">U</span>;
      case "added":
        return <span className="text-xs font-medium text-green-600">A</span>;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "modified":
        return "text-yellow-600";
      case "deleted":
        return "text-red-600 line-through";
      case "untracked":
      case "added":
        return "text-green-600";
      default:
        return "text-foreground";
    }
  };

  const renderFileList = (
    files: GitFile[],
    collapsed: boolean,
    toggleCollapsed: () => void,
    title: string,
    isStaged: boolean = false,
  ) => {
    if (files.length === 0) return null;

    return (
      <>
        <div
          className="px-3 py-2 border-b flex items-center justify-between cursor-pointer hover:bg-accent/50 select-none"
          onClick={toggleCollapsed}
        >
          <h3 className="text-sm text-muted-foreground">
            {title} ({files.length})
          </h3>
          <div className="flex items-center gap-1">
            {isStaged && files.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearStaged();
                }}
                className="p-1 hover:bg-accent rounded"
                title={t("git.removeAllFromStage")}
                disabled={loading}
              >
                <ArrowDown className="w-3 h-3 text-muted-foreground/60 hover:text-muted-foreground" />
              </button>
            )}
            {!isStaged && files.length > 0 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    stageAll();
                  }}
                  className="p-1 hover:bg-accent rounded"
                  title={t("git.addAllToStage")}
                  disabled={loading}
                >
                  <ArrowUp className="w-3 h-3 text-muted-foreground/60 hover:text-muted-foreground" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    revertAll();
                  }}
                  className="p-1 hover:bg-accent rounded"
                  title={t("git.revertAllFiles")}
                  disabled={loading}
                >
                  <Undo2 className="w-3 h-3 text-muted-foreground/60 hover:text-muted-foreground" />
                </button>
              </>
            )}
            {collapsed ? (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {!collapsed && (
          <div className="overflow-y-auto">
            {files.map((file) => (
              <div
                key={file.fullPath}
                className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 border-b border-border/50 cursor-pointer"
                title={file.relPath}
                onClick={() => showDiff(file.fullPath)}
              >
                <div className="flex-shrink-0">{getFileIcon(file.extName)}</div>

                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${getStatusColor(file.status)}`}>
                    {file.fileName}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{file.relPath}</div>
                </div>

                <div className="flex-shrink-0 flex items-center gap-1">
                  {getStatusText(file.status)}

                  {isStaged ? (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromStage(file);
                        }}
                        className="p-1 hover:bg-accent rounded"
                        title={t("git.removeFromStage")}
                      >
                        <ArrowDown className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          revert(file);
                        }}
                        className="p-1 hover:bg-accent rounded"
                        title={t("git.revertFile")}
                      >
                        <Undo2 className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          add2stage(file);
                        }}
                        className="p-1 hover:bg-accent rounded"
                        title={t("git.addToStage")}
                      >
                        <ArrowUp className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          revert(file);
                        }}
                        className="p-1 hover:bg-accent rounded"
                        title={t("git.revertFile")}
                      >
                        <Undo2 className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  if (!activeProject) {
    return (
      <div className="flex h-full flex-col p-3 gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground">{t("git.title")}</h2>
        <div className="p-4 text-sm text-center text-muted-foreground">{t("git.noProject")}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col p-3 gap-2">
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("git.loadingStatus")}</p>
          </div>
        </div>
      </div>
    );
  }

  const hasChanges = workingFiles.length > 0 || stagedFiles.length > 0;
  if (!hasChanges) {
    return (
      <div className="flex h-full flex-col p-3 gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground">{t("git.title")}</h2>
        <div className="p-4 text-sm text-center text-muted-foreground">{t("git.noChanges")}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-3 gap-2">
      <h2 className="text-xs font-semibold text-muted-foreground">{t("git.title")}</h2>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground/70">{t("git.status")}</span>
          <button
            onClick={() => activeProject?.path && refreshGitStatus(activeProject.path)}
            className="p-0.5 hover:bg-accent/50 rounded"
            title={t("git.refreshStatus")}
            disabled={loading}
          >
            <RefreshCw
              className={`w-3 h-3 text-muted-foreground/60 hover:text-muted-foreground ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {renderFileList(
          stagedFiles,
          stagedCollapsed,
          () => setStagedCollapsed(!stagedCollapsed),
          t("git.stagedChanges"),
          true,
        )}
        {stagedFiles.length > 0 && workingFiles.length > 0 && (
          <div className="border-t border-border/50"></div>
        )}
        {renderFileList(
          workingFiles,
          workingCollapsed,
          () => setWorkingCollapsed(!workingCollapsed),
          t("git.workingChanges"),
          false,
        )}
      </div>
    </div>
  );
});
