import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Undo2,
  Plus,
  FileText,
  Minus,
  File,
} from "lucide-react";
import { memo, useEffect, useState } from "react";

import { type GitFile } from "../../../../shared/plugins/git/contract";
import { useLayoutStore } from "../../components/app-layout/store";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { usePluginContext } from "../../core/app";
import { useProjectStore } from "../../features/project/store";
import { useGit } from "./hooks/useGit";
import { useGitTranslation } from "./i18n";

const DISPATCH_DELAY = 400;

export default memo(function GitView() {
  const { t } = useGitTranslation();
  const { app } = usePluginContext();
  const activeProject = useProjectStore((s) => s.activeProject);
  const cwd = activeProject?.path || "";

  const [workingCollapsed, setWorkingCollapsed] = useState(false);
  const [stagedCollapsed, setStagedCollapsed] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [revertTarget, setRevertTarget] = useState<"all" | "single" | null>(null);
  const [fileToRevert, setFileToRevert] = useState<GitFile | null>(null);

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

  const handleRevertRequest = (file?: GitFile) => {
    if (file) {
      setFileToRevert(file);
      setRevertTarget("single");
    } else {
      setRevertTarget("all");
    }
    setRevertConfirmOpen(true);
  };

  const handleConfirmRevert = async () => {
    if (revertTarget === "all") {
      await revertAll();
    } else if (revertTarget === "single" && fileToRevert) {
      await revert(fileToRevert);
    }
    setRevertConfirmOpen(false);
    setRevertTarget(null);
    setFileToRevert(null);
  };

  const showDiff = (file: { relPath: string }, isStaged: boolean) => {
    app.workbench.contentPanel.openView("git-diff");
    // 发送事件让diff组件加载指定文件
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("neovate:open-git-diff", {
          detail: { relPath: file.relPath, isStaged },
        }),
      );
    }, DISPATCH_DELAY);
  };

  const openFile = (file: { fullPath: string }) => {
    app.workbench.contentPanel.openView("editor");
    window.dispatchEvent(
      new CustomEvent("neovate:open-editor", {
        detail: { fullPath: file.fullPath },
      }),
    );
    // @ts-ignore 避免 dispatchEvent 时未初始化完成
    window.pendingEditorRequest = { fullPath: file.fullPath };
  };

  const isGitPanelVisible = useLayoutStore(
    (s) => !s.panels.secondarySidebar?.collapsed && s.panels.secondarySidebar?.activeView === "git",
  );

  // Poll git status when the git panel is visible
  useEffect(() => {
    if (!cwd || !isGitPanelVisible) return;
    refreshGitStatus(cwd);

    const interval = setInterval(() => {
      refreshGitStatus(cwd, false);
    }, 5000);

    return () => clearInterval(interval);
  }, [cwd, isGitPanelVisible]);

  const getFileIcon = (filePath: string) => {
    const filename = filePath.split("/").pop() || filePath;
    const suffix = filename.split(".").pop();
    return <div className="seti-icon flex-shrink-0 w-3.5 h-3.5" data-lang={suffix}></div>;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "modified":
        return <span className="text-xs font-medium text-yellow-600 leading-none">M</span>;
      case "deleted":
        return <span className="text-xs font-medium text-red-600 leading-none">D</span>;
      case "untracked":
        return <span className="text-xs font-medium text-green-600 leading-none">U</span>;
      case "added":
        return <span className="text-xs font-medium text-green-600 leading-none">A</span>;
      default:
        return null;
    }
  };

  const viewAll = (type: "staged" | "unstaged") => {
    app.workbench.contentPanel.openView("review");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("neovate:open-review", { detail: { category: type } }));
    }, DISPATCH_DELAY);
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
          className="w-full py-2 p-3 flex items-center justify-between cursor-pointer hover:bg-accent/50 select-none group rounded-sm"
          onClick={toggleCollapsed}
        >
          <h3 className="text-xs font-medium text-muted-foreground">
            {title} ({files.length})
          </h3>
          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            {isStaged && files.length > 0 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    viewAll("staged");
                  }}
                  className="p-px hover:bg-accent rounded-sm cursor-pointer"
                  title={t("git.viewAllStageChanges")}
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground pointer-events-none" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearStaged();
                  }}
                  className="p-px hover:bg-accent rounded-sm cursor-pointer"
                  title={t("git.removeAllFromStage")}
                  disabled={loading}
                >
                  <Minus className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground pointer-events-none" />
                </button>
              </>
            )}
            {!isStaged && files.length > 0 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    viewAll("unstaged");
                  }}
                  className="p-px hover:bg-accent rounded-sm cursor-pointer"
                  title={t("git.viewAllWorkingChanges")}
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground pointer-events-none" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    stageAll();
                  }}
                  className="p-px hover:bg-accent rounded-sm cursor-pointer"
                  title={t("git.addAllToStage")}
                  disabled={loading}
                >
                  <Plus className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground pointer-events-none" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRevertRequest();
                  }}
                  className="p-px hover:bg-accent rounded-sm cursor-pointer"
                  title={t("git.revertAllFiles")}
                  disabled={loading}
                >
                  <Undo2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground pointer-events-none" />
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
          <div>
            {files.map((file) => (
              <div
                key={file.fullPath}
                className="p-3 w-full py-0.5 flex items-center gap-1.5 hover:bg-accent/50 cursor-pointer transition-colors group rounded-sm"
                onClick={() => showDiff(file, isStaged)}
              >
                {getFileIcon(file.relPath)}

                <div className="text-sm truncate mr-auto text-foreground" title={file.relPath}>
                  {file.fileName}
                </div>

                <div className="flex-shrink-0 flex items-center gap-0.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openFile(file);
                      }}
                      className="p-px hover:bg-accent rounded-sm cursor-pointer"
                      title={t("git.openFile")}
                    >
                      <File className="w-3 h-3 text-muted-foreground hover:text-foreground pointer-events-none" />
                    </button>
                    {isStaged ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromStage(file);
                          }}
                          className="p-px hover:bg-accent rounded-sm cursor-pointer"
                          title={t("git.unstageChanges")}
                        >
                          <Minus className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground pointer-events-none" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRevertRequest(file);
                          }}
                          className="p-px hover:bg-accent rounded-sm cursor-pointer"
                          title={t("git.discardChanges")}
                        >
                          <Undo2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground pointer-events-none" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            add2stage(file);
                          }}
                          className="p-px hover:bg-accent rounded-sm cursor-pointer"
                          title={t("git.stageChanges")}
                        >
                          <Plus className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground pointer-events-none" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRevertRequest(file);
                          }}
                          className="p-px hover:bg-accent rounded-sm cursor-pointer"
                          title={t("git.discardChanges")}
                        >
                          <Undo2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground pointer-events-none" />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="ml-1">{getStatusText(file.status)}</div>
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
        <h2 className="text-sm font-semibold text-muted-foreground">{t("git.title")}</h2>
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

  return (
    <div className="flex h-full mb-2 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("git.title")}</h2>
        <button
          onClick={() => cwd && refreshGitStatus(cwd)}
          className="p-px hover:bg-accent/50 rounded-sm cursor-pointer"
          title={t("git.refreshStatus")}
          disabled={loading}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground pointer-events-none ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {hasChanges ? (
            <>
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
            </>
          ) : (
            <div className="p-4 text-sm text-center text-muted-foreground">
              {t("git.noChanges")}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={revertConfirmOpen} onOpenChange={setRevertConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {revertTarget === "all" ? t("git.revertAll.title") : t("git.revert.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revertTarget === "all"
                ? t("git.revertAll.description")
                : t("git.revert.description", { name: fileToRevert?.fileName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t("common.cancel", { ns: "translation" })}
            </AlertDialogClose>
            <Button variant="destructive" onClick={handleConfirmRevert}>
              {t("git.revert.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
});
