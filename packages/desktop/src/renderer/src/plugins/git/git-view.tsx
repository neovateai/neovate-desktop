import { FileSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Undo2,
  Plus,
  Minus,
  File,
  Sparkles,
  Check,
  Upload,
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
import { Button, buttonVariants } from "../../components/ui/button";
import { Group } from "../../components/ui/button-group";
import { Input } from "../../components/ui/input";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../../components/ui/menu";
import { toastManager } from "../../components/ui/toast";
import {
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
  TooltipProvider,
} from "../../components/ui/tooltip";
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
  const [commitMsg, setCommitMsg] = useState("");

  const {
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

  const handleCommit = async (message: string, shouldPush: boolean) => {
    const result = await commit(message, shouldPush);

    // commit 失败
    if (!result?.commit) {
      toastManager.add({
        type: "error",
        title: t("git.commitFailed"),
        description: result.error,
      });
      return;
    }

    if (shouldPush) {
      // push 时需要设置上游分支
      if (result?.needsUpstream) {
        const toast = toastManager.add({
          type: "warning",
          title: t("git.noUpstreamBranch"),
          description: t("git.noUpstreamBranchDesc", { branch: result.branch }),
          actionProps: {
            children: t("git.setUpstreamAndPush"),
            onClick: async () => {
              toastManager.close(toast);
              const pushRes = await push(true);
              if (!pushRes.success) {
                toastManager.add({
                  type: "error",
                  title: t("git.pushFailed"),
                  description: pushRes.error,
                });
              } else {
                toastManager.add({
                  type: "success",
                  title: t("git.pushSuccess"),
                });
                setCommitMsg("");
              }
            },
          },
        });
        return;
      }
      // push 失败
      if (!result.push) {
        toastManager.add({
          type: "error",
          title: t("git.pushFailed"),
          description: result.error,
        });
        return;
      }
      // commit + push 成功
      toastManager.add({
        type: "success",
        title: t("git.pushSuccess"),
      });
      setCommitMsg("");
    } else {
      // 仅 commit 成功
      toastManager.add({
        type: "success",
        title: t("git.commitSuccess"),
      });
      setCommitMsg("");
    }
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
    return (
      <div
        className="seti-icon flex-shrink-0 w-3.5 h-3.5"
        data-lang={suffix}
        data-name={filename}
      ></div>
    );
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
    app.workbench.contentPanel.openView("changes");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("neovate:open-changes", { detail: { category: type } }));
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
                  data-track-id="plugin-git.staged-changes.viewed"
                >
                  <HugeiconsIcon
                    icon={FileSearchIcon}
                    className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground pointer-events-none"
                    size={14}
                  />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearStaged();
                  }}
                  className="p-px hover:bg-accent rounded-sm cursor-pointer"
                  title={t("git.removeAllFromStage")}
                  disabled={loading}
                  data-track-id="plugin-git.staged-changes.cleared"
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
                  data-track-id="plugin-git.unstaged-changes.viewed"
                >
                  <HugeiconsIcon
                    icon={FileSearchIcon}
                    className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground pointer-events-none"
                    size={14}
                  />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    stageAll();
                  }}
                  className="p-px hover:bg-accent rounded-sm cursor-pointer"
                  title={t("git.addAllToStage")}
                  disabled={loading}
                  data-track-id="plugin-git.unstaged-changes.staged"
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
                  data-track-id="plugin-git.unstaged-changes.revert-initiated"
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

                <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
                  <span
                    className="text-sm text-foreground truncate flex-shrink-0 max-w-[50%]"
                    title={file.fileName}
                  >
                    {file.fileName}
                  </span>
                  <span
                    className="text-xs text-muted-foreground truncate flex-shrink min-w-0"
                    title={file.relPath}
                  >
                    {file.relPath}
                  </span>
                </div>

                <div className="flex-shrink-0 flex items-center gap-0.5 w-0 overflow-hidden group-hover:w-auto group-hover:overflow-visible transition-[width]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openFile(file);
                    }}
                    className="p-px hover:bg-accent rounded-sm cursor-pointer"
                    title={t("git.openFile")}
                    data-track-id="plugin-git.file.opened"
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
                        data-track-id="plugin-git.file.unstaged"
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
                        data-track-id="plugin-git.file.revert-initiated"
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
                        data-track-id="plugin-git.file.staged"
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
                        data-track-id="plugin-git.file.revert-initiated"
                      >
                        <Undo2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground pointer-events-none" />
                      </button>
                    </>
                  )}
                </div>

                <div className="ml-1">{getStatusText(file.status)}</div>
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
          data-track-id="plugin-git.status.refreshed"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground pointer-events-none ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>
      <div className="px-3 pb-2 space-y-2">
        <div className="relative">
          <Input
            placeholder={t("git.commitPlaceholder")}
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            disabled={loading}
            className="h-8 pr-8 text-xs bg-muted rounded-md"
          />
          {stagedFiles.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  onClick={async () => {
                    const r = await genCommitMsg();
                    if (!r?.success) {
                      toastManager.add({
                        type: "error",
                        title: t("git.generateMessageFailed"),
                        description: r?.error || "Unknown error",
                      });
                    } else {
                      setCommitMsg(r.result);
                    }
                  }}
                  disabled={loading || commitStatus !== "idle"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-accent rounded-sm cursor-pointer text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {commitStatus === "generating" ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                </TooltipTrigger>
                <TooltipPopup>
                  {commitStatus === "generating" ? t("git.generating") : t("git.generateMessage")}
                </TooltipPopup>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <Group className="w-full">
          <Button
            size="sm"
            className="flex-1 rounded-e-none border-e-0"
            onClick={() => {
              handleCommit(commitMsg, false);
            }}
            disabled={
              loading || commitStatus !== "idle" || stagedFiles.length === 0 || !commitMsg.trim()
            }
          >
            {commitStatus === "generating" && t("git.generating")}
            {commitStatus === "committing" && t("git.committing")}
            {commitStatus === "pushing" && t("git.pushing")}
            {commitStatus === "idle" && t("git.commit")}
          </Button>
          <Menu>
            <MenuTrigger
              className={buttonVariants({
                size: "sm",
                className: "rounded-s-none px-2 border-s-0",
              })}
              disabled={
                loading || commitStatus !== "idle" || stagedFiles.length === 0 || !commitMsg.trim()
              }
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </MenuTrigger>
            <MenuPopup align="end" side="bottom">
              <MenuItem
                onClick={() => {
                  handleCommit(commitMsg, false);
                }}
              >
                <Check className="w-3.5 h-3.5" />
                {t("git.commitOnly")}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  handleCommit(commitMsg, true);
                }}
              >
                <Upload className="w-3.5 h-3.5" />
                {t("git.commitAndPush")}
              </MenuItem>
            </MenuPopup>
          </Menu>
        </Group>
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
            <Button
              variant="destructive"
              onClick={handleConfirmRevert}
              data-track-id="plugin-git.revert.confirmed"
            >
              {t("git.revert.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
});
