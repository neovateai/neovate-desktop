import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, RefreshCw, Undo2 } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { type GitFile } from "../../../../shared/plugins/git/contract";
import { layoutStore } from "../../components/app-layout/store";
import { usePluginContext } from "../../core/app";
import { useProjectStore } from "../../features/project/store";
import { useGit } from "./hooks/useGit";
import { useGitTranslation } from "./i18n";

export default memo(function GitView() {
  const { t } = useGitTranslation();
  const { app } = usePluginContext();
  const activeProject = useProjectStore((s) => s.activeProject);
  const cwd = activeProject?.path || "";

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
  } = useGit(cwd);

  const showDiff = (file: { relPath: string }, isStaged: boolean) => {
    const { panels } = layoutStore.getState();
    const contentPanelState = panels.contentPanel;
    if (contentPanelState?.collapsed === true) {
      layoutStore.getState().togglePanel("contentPanel");
    }
    app.workbench.contentPanel.openView("git-diff");
    // 发送事件让diff组件加载指定文件
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("neovate:open-git-diff", {
          detail: { relPath: file.relPath, isStaged },
        }),
      );
    }, 100);
  };

  useEffect(() => {
    if (!cwd) return;
    refreshGitStatus(cwd);

    const onFsChange = () => {
      refreshGitStatus(cwd, false);
    };

    window.addEventListener("neovate:fs-change", onFsChange);

    return () => {
      window.addEventListener("neovate:fs-change", onFsChange);
    };
  }, [cwd]);

  const getFileIcon = (filePath: string) => {
    const filename = filePath.split("/").pop() || filePath;
    const suffix = filename.split(".").pop();
    return (
      <div
        className="seti-icon flex-shrink-0"
        data-lang={suffix}
        style={{ fontSize: 12, width: 12, height: 12 }}
      ></div>
    );
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "modified":
        return <span className="text-xs font-mono text-yellow-600 leading-none">M</span>;
      case "deleted":
        return <span className="text-xs font-mono text-red-600 leading-none">D</span>;
      case "untracked":
        return <span className="text-xs font-mono text-green-600 leading-none">U</span>;
      case "added":
        return <span className="text-xs font-mono text-green-600 leading-none">A</span>;
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
          className="px-2.5 py-1 flex items-center justify-between cursor-pointer hover:bg-accent/50 select-none group rounded-sm"
          onClick={toggleCollapsed}
        >
          <h3 className="text-xs font-medium text-muted-foreground">
            {title} ({files.length})
          </h3>
          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            {isStaged && files.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearStaged();
                }}
                className="p-0.5 hover:bg-accent rounded-sm"
                title={t("git.removeAllFromStage")}
                disabled={loading}
              >
                <ArrowDown className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </button>
            )}
            {!isStaged && files.length > 0 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    stageAll();
                  }}
                  className="p-0.5 hover:bg-accent rounded-sm"
                  title={t("git.addAllToStage")}
                  disabled={loading}
                >
                  <ArrowUp className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    revertAll();
                  }}
                  className="p-0.5 hover:bg-accent rounded-sm"
                  title={t("git.revertAllFiles")}
                  disabled={loading}
                >
                  <Undo2 className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                </button>
              </>
            )}
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </div>
        </div>

        {!collapsed && (
          <div className="overflow-y-auto">
            {files.map((file) => (
              <div
                key={file.fullPath}
                className="flex items-center gap-2 px-2 py-1 hover:bg-accent/50 cursor-pointer transition-colors group rounded-sm"
                onClick={() => showDiff(file, isStaged)}
              >
                <div className="flex items-center justify-center h-4 w-4">
                  {getFileIcon(file.relPath)}
                </div>

                <div
                  className={`text-xs truncate mr-auto ${getStatusColor(file.status)}`}
                  title={file.relPath}
                >
                  {file.fileName}
                </div>

                <div className="flex-shrink-0 flex items-center gap-0.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isStaged ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromStage(file);
                          }}
                          className="p-0.5 hover:bg-accent rounded-sm"
                          title={t("git.removeFromStage")}
                        >
                          <ArrowDown className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            revert(file);
                          }}
                          className="p-0.5 hover:bg-accent rounded-sm"
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
                          className="p-0.5 hover:bg-accent rounded-sm"
                          title={t("git.addToStage")}
                        >
                          <ArrowUp className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            revert(file);
                          }}
                          className="p-0.5 hover:bg-accent rounded-sm"
                          title={t("git.revertFile")}
                        >
                          <Undo2 className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="ml-1.5">{getStatusText(file.status)}</div>
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
    <div className="flex h-full flex-col p-2 gap-1">
      <h2 className="text-xs font-semibold text-muted-foreground px-1">{t("git.title")}</h2>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground/70">{t("git.status")}</span>
          <button
            onClick={() => cwd && refreshGitStatus(cwd)}
            className="p-0.5 hover:bg-accent/50 rounded-sm"
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
