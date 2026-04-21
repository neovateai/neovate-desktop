import type { ContractRouterClient } from "@orpc/contract";

import { Folder02Icon, File02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { consumeEventIterator } from "@orpc/client";
import debug from "debug";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Project } from "../../../../shared/features/project/types";
import type { MenuGroup } from "./menu-types";

import { filesContract } from "../../../../shared/plugins/files/contract";
import { getEmpty2Url } from "../../assets/images";
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
import {
  ContextMenu,
  ContextMenuPopup,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";
import { toastManager } from "../../components/ui/toast";
import { usePluginContext } from "../../core/app";
import { useProjectStore } from "../../features/project/store";
import { ContextMenuGroups } from "./context-menu-groups";
import { FileNodeItem, FileTreeContext, useFileData } from "./hooks/useFileData";
import { useTreeKeyboardShortcuts } from "./hooks/useTreeKeyboardShortcuts";
import { useFilesTranslation } from "./i18n";
import { buildCreationMenu, buildPathMenu } from "./menu-utils";
import { TreeNode } from "./tree-node";
import { getCreateErrorMessage } from "./utils/error";

const log = debug("neovate:files-view");

// Constants for timeouts (in milliseconds)
const DEBOUNCE_REVEAL_MS = 50; // Debounce reveal when editor tabs change
const PANEL_VISIBLE_DELAY_MS = 100; // Delay before revealing when panel becomes visible
const REFRESH_DEBOUNCE_MS = 500; // Debounce directory refresh on file system events

interface FilesViewProps {
  project: Project | null;
}

type FilesClient = ContractRouterClient<{ files: typeof filesContract }>;

function FilesViewComponent({ project }: FilesViewProps) {
  const { t } = useFilesTranslation();
  const { orpcClient, app } = usePluginContext();
  const client = orpcClient as FilesClient;

  const [loading, setLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FileNodeItem | null>(null);
  const [clipboardItem, setClipboardItem] = useState<{
    sourcePath: string;
    operation: "copy" | "cut";
  } | null>(null);
  const [rootCreating, setRootCreating] = useState<{ type: "file" | "folder" } | null>(null);
  const [rootCreatingName, setRootCreatingName] = useState("");
  const { resolvedTheme } = useTheme();

  const cwd = project?.path || "";

  const isVisible = useLayoutStore(
    (s) =>
      !s.panels.secondarySidebar?.collapsed && s.panels.secondarySidebar?.activeView === "files",
  );

  // Debounce timers for per-directory refresh
  const refreshTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Debounce timer for revealFile
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Pending file path to reveal when panel becomes visible
  const pendingRevealPathRef = useRef<string | null>(null);

  const {
    nodes,
    updateNodeDir,
    selectedKeys,
    select,
    removeNode,
    cancelSelect,
    expandedKeys,
    reset,
    focus,
    toggleExpand,
    expand,
    renameStart,
    renameEnd,
    renameEffect,
    renamingKey,
    pendingCreation,
    createStart,
    createEnd,
  } = useFileData({
    cwd,
    watch: startWatcher,
    doLoad: (dirs, nodes) => doLoad(dirs, nodes),
  });

  const fetchChildren = useCallback(
    async (dir: string) => {
      if (!cwd) return [];
      try {
        const { tree } = await client.files.tree({ cwd: dir, root: cwd });
        updateNodeDir(dir, tree);
        return tree;
      } catch (error) {
        log("failed to fetch children", { dir, error });
        return [];
      }
    },
    [cwd, client.files, updateNodeDir],
  );

  const doLoad = useCallback(
    async (dirs: string[], currentNodes: FileNodeItem[]) => {
      const allDirsToLoad = new Set<string>(dirs);

      // Helper to collect missing parent directories recursively
      const collectMissingParents = (dirPath: string) => {
        // Calculate parent path
        const lastSlash = dirPath.lastIndexOf("/");
        if (lastSlash === -1) return;

        const parentDir = dirPath.substring(0, lastSlash);

        // Stop at cwd
        if (!parentDir || !parentDir.startsWith(cwd)) return;

        // Only add parent if not already in nodes
        const exists = currentNodes.some((n) => n.fullPath === parentDir);
        if (exists) return;

        allDirsToLoad.add(parentDir);

        // Recursively check parent's parent
        collectMissingParents(parentDir);
      };

      // Collect missing parents for each requested directory
      for (const dir of dirs) {
        collectMissingParents(dir);
      }

      // Load directories sorted by depth (shallow first) to ensure parent-before-child
      const sortedDirs = Array.from(allDirsToLoad).sort((a, b) => {
        const depthA = a.split("/").length;
        const depthB = b.split("/").length;
        return depthA - depthB;
      });

      await Promise.allSettled(sortedDirs.map((i) => fetchChildren(i)));
    },
    [cwd, fetchChildren],
  );

  // --- Watcher management (Section 2b) ---
  function startWatcher(dir: string) {
    log("starting watcher", { dir });

    const cancel = consumeEventIterator(client.files.watch({ cwd: dir }), {
      onEvent: () => {
        // Debounce refresh per directory (Section 3d)
        const existing = refreshTimersRef.current.get(dir);
        if (existing) clearTimeout(existing);
        refreshTimersRef.current.set(
          dir,
          setTimeout(async () => {
            refreshTimersRef.current.delete(dir);
            fetchChildren(dir);
          }, REFRESH_DEBOUNCE_MS),
        );
      },
      onError: (e) => {
        log("file watch error: consumeEventIterator", e);
      },
    });
    return cancel;
  }

  // reset when cwd changed
  useEffect(() => {
    if (!cwd) {
      return;
    }
    setLoading(true);
    fetchChildren(cwd).then(() => {
      setLoading(false);
    });

    return () => {
      reset();
    };
  }, [cwd]);

  // --- Keyboard shortcuts ---
  useTreeKeyboardShortcuts({
    cwd,
    selectedKeys: selectedKeys,
    renamingKey,
    pendingCreation,
    nodes,
    clipboardItem,
    onRenameStart: renameStart,
    onCopy: (node) => handleCopy(node),
    onCut: (node) => handleCut(node),
    onPaste: (node) => handlePaste(node),
  });

  const handleSelect = (item: FileNodeItem) => {
    select(item.fullPath);

    if (!item.isFolder && project) {
      log("open file path=%s", item.relPath);
      app.workbench.contentPanel.openView("editor");
      window.dispatchEvent(
        new CustomEvent("neovate:open-editor", {
          detail: { fullPath: item.fullPath },
        }),
      );
      // @ts-ignore avoid accessing before initialization completes
      window.pendingEditorRequest = { fullPath: item.fullPath };
    }
  };

  const revealInFileManager = async (path: string) => {
    log("reveal in file manager", { path });
    const result = await client.files.revealInFileManager({ path });
    if (!result.success && result.error) {
      toastManager.add({
        type: "error",
        title: t("contextMenu.revealInFinder"),
        description: result.error,
      });
    }
  };

  const handleDelete = (item: FileNodeItem) => {
    setItemToDelete(item);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    const targetPath = itemToDelete.fullPath;
    log("confirm delete", { path: itemToDelete.fullPath });
    try {
      const result = await client.files.delete({ path: targetPath });
      if (result.success) {
        removeNode(targetPath);
      } else {
        toastManager.add({
          type: "error",
          title: t("error.deleteFailed", { error: result.error }),
        });
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      toastManager.add({
        type: "error",
        title: t("error.deleteFailed", { error: String(error) }),
      });
    } finally {
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    }
  };
  const handleRename = async (oldPath: string, newPath: string): Promise<boolean> => {
    log("rename", { oldPath, newPath });
    try {
      const result = await client.files.rename({ oldPath, newPath });
      if (result.success) {
        renameEffect(oldPath, newPath);
        return true;
      } else {
        toastManager.add({
          type: "error",
          title: t("error.renameFailed", { error: result.error }),
        });
        return false;
      }
    } catch (error) {
      console.error("Error renaming file:", error);
      toastManager.add({
        type: "error",
        title: t("error.renameFailed", { error: String(error) }),
      });
      return false;
    }
  };

  const handleCreate = async (newNode: { parentPath: string; name: string; isFolder: boolean }) => {
    const { parentPath, name, isFolder } = newNode || {};
    if (!parentPath || !name) {
      return;
    }
    if (!isFolder) {
      createFile(parentPath, name);
    } else {
      createFolder(parentPath, name);
    }
  };

  const createFile = async (parentPath: string, name: string) => {
    const fullPath = `${parentPath}/${name}`;
    log("create file", { parentPath, name, fullPath });
    try {
      const result = await client.files.createFile({ path: fullPath });
      if (result.success) {
        setTimeout(() => {
          select(fullPath);
        }, 1500); // simple delay to wait for data loaded
      } else {
        toastManager.add({
          type: "error",
          title: getCreateErrorMessage(result.errorCode, result.error || "", "file", t),
        });
      }
    } catch (error) {
      console.error("Error creating file:", error);
      toastManager.add({
        type: "error",
        title: t("error.createFileFailed", { error: String(error) }),
      });
    }
  };

  const createFolder = async (parentPath: string, name: string) => {
    const fullPath = `${parentPath}/${name}`;
    log("create folder", { parentPath, name, fullPath });
    try {
      const result = await client.files.createFolder({ path: fullPath });
      if (result.success) {
        setTimeout(() => {
          select(fullPath);
        }, 1500);
      } else {
        toastManager.add({
          type: "error",
          title: getCreateErrorMessage(result.errorCode, result.error || "", "folder", t),
        });
      }
    } catch (error) {
      console.error("Error creating folder:", error);
      toastManager.add({
        type: "error",
        title: t("error.createFolderFailed", { error: String(error) }),
      });
    }
  };

  /** Add file to conversation */
  const handleAddContext = (item: FileNodeItem) => {
    log("insert-chat dispatching mention=%s", item.relPath);
    window.dispatchEvent(
      new CustomEvent("neovate:insert-chat", {
        detail: { mentions: [{ id: item.relPath, label: item.relPath }] },
      }),
    );
  };

  const handleCopy = (item: FileNodeItem) => {
    log("copy to clipboard", { sourcePath: item.fullPath });
    setClipboardItem({ sourcePath: item.fullPath, operation: "copy" });
  };
  const handleCut = (item: FileNodeItem) => {
    log("cut to clipboard", { sourcePath: item.fullPath });
    setClipboardItem({ sourcePath: item.fullPath, operation: "cut" });
  };

  /** Check if paste is allowed at target path */
  const canPaste = (targetPath: string): boolean => {
    if (!clipboardItem) return false;
    // Cannot paste to itself or descendant
    if (clipboardItem.sourcePath === targetPath) return false;
    if (targetPath.startsWith(clipboardItem.sourcePath + "/")) return false;
    return true;
  };

  /** Paste file from clipboard to target directory */
  const handlePaste = async (targetDir: string) => {
    if (!clipboardItem) return;
    const { sourcePath, operation } = clipboardItem;
    const fileName = sourcePath.split("/").pop() || "";
    const targetPath = `${targetDir}/${fileName}`;

    log("paste", { sourcePath, targetPath, operation });

    try {
      if (operation === "copy") {
        const result = await client.files.copy({ sourcePath, targetPath });
        if (!result.success) {
          toastManager.add({
            type: "error",
            title: t("error.copyFailed", { error: result.error }),
          });
          return;
        }
      } else {
        if (sourcePath === targetPath) {
          setClipboardItem(null);
          return;
        }
        const result = await client.files.move({ sourcePath, targetPath });
        if (!result.success) {
          toastManager.add({
            type: "error",
            title: t("error.moveFailed", { error: result.error }),
          });
          return;
        }
        // Clear clipboard after cut operation completes
        setClipboardItem(null);
      }
    } catch (error) {
      console.error("Error pasting file:", error);
      toastManager.add({
        type: "error",
        title: t(operation === "copy" ? "error.copyFailed" : "error.moveFailed", {
          error: String(error),
        }),
      });
    }
  };

  // --- Reveal pending file when panel becomes visible ---
  useEffect(() => {
    if (isVisible && pendingRevealPathRef.current) {
      const pathToReveal = pendingRevealPathRef.current;
      log("panel became visible, revealing pending file", { pathToReveal });
      // Use timeout to ensure panel is fully rendered
      setTimeout(() => {
        focus(pathToReveal);
      }, PANEL_VISIBLE_DELAY_MS);
    }
  }, [isVisible]);

  useEffect(() => {
    const handleEditorTabsChange = (
      e: CustomEvent<{
        tabs: Array<{ isActive: boolean; fullPath: string }>;
      }>,
    ) => {
      const { tabs } = e.detail || {};
      const activeTab = tabs?.find((t) => t.isActive);
      if (activeTab?.fullPath) {
        // Debounce: clear previous timer and set new one
        if (revealTimerRef.current) {
          clearTimeout(revealTimerRef.current);
        }
        revealTimerRef.current = setTimeout(() => {
          focus(activeTab.fullPath);
        }, DEBOUNCE_REVEAL_MS);
      }
    };

    window.addEventListener("neovate:editor-tabs-change", handleEditorTabsChange as EventListener);
    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
      }
      window.removeEventListener(
        "neovate:editor-tabs-change",
        handleEditorTabsChange as EventListener,
      );
    };
  }, []); // Empty deps - listener only registered once

  if (!project) {
    return (
      <div className="flex h-full flex-col p-3">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("title")}</h2>
        <div className="flex flex-1 items-center justify-center flex-col gap-2 ">
          <img
            src={getEmpty2Url(resolvedTheme as "dark" | "light" | undefined)}
            alt="Empty"
            className="shrink-0"
            style={{ width: 67 + "px", marginLeft: "10px" }}
            aria-hidden
          />
          <p className="text-xs text-muted-foreground">{t("noProject")}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col p-3">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("title")}</h2>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground">
            {t("common.loading", { ns: "translation" })}
          </p>
        </div>
      </div>
    );
  }

  const handleRootCreateFinish = async () => {
    if (rootCreatingName && rootCreating && cwd) {
      if (rootCreating.type === "file") {
        await createFile(cwd, rootCreatingName);
      } else {
        await createFolder(cwd, rootCreatingName);
      }
    }
    setRootCreating(null);
    setRootCreatingName("");
  };

  const handleRootCreateCancel = () => {
    setRootCreating(null);
    setRootCreatingName("");
  };

  const buildRootMenu = (): MenuGroup[] => {
    const groups: MenuGroup[] = [];

    // Group 1: New file/folder, Reveal in Finder
    const creationItems = buildCreationMenu(t, {
      onCreateFile: () => {
        setRootCreating({ type: "file" });
        setRootCreatingName("");
      },
      onCreateFolder: () => {
        setRootCreating({ type: "folder" });
        setRootCreatingName("");
      },
      onReveal: cwd ? () => revealInFileManager(cwd) : undefined,
    });
    groups.push(creationItems);

    // Group 2: Paste (if clipboard has item)
    if (clipboardItem && canPaste(cwd)) {
      groups.push([{ label: t("contextMenu.paste"), action: () => handlePaste(cwd) }]);
    }

    // Group 3: Copy Path
    groups.push(buildPathMenu(t, { fullPath: cwd || "", relativePath: "." }));

    return groups;
  };

  const rootMenuGroups = buildRootMenu();

  const rootLevelNodes = nodes.filter((i) => i.parentPath === cwd);

  return (
    <FileTreeContext.Provider
      value={{
        nodes,
        expandedKeys,
        selectedKeys,
        renameStart,
        renameEnd,
        renamingKey,
        pendingCreation,
        createStart,
        createEnd,
      }}
    >
      <div className="flex h-full flex-col p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("title")}</h2>
        </div>

        <ContextMenu>
          <ContextMenuTrigger
            render={
              <div
                className="flex-1 overflow-auto -mr-2.5"
                onClick={(e) => {
                  // Only clear selection when clicking the empty area (not tree nodes)
                  if (e.target === e.currentTarget) {
                    cancelSelect();
                  }
                }}
              >
                {rootCreating && (
                  <div className="flex items-center gap-1 px-2 py-1 hover:bg-accent hover:text-accent-foreground rounded-sm">
                    <div className="w-4 h-4 flex items-center justify-center">
                      <HugeiconsIcon
                        icon={rootCreating.type === "folder" ? Folder02Icon : File02Icon}
                        size={18}
                        strokeWidth={1.5}
                      />
                    </div>
                    <span className="flex-1 text-sm ml-2 cursor-pointer">
                      <input
                        type="text"
                        placeholder={
                          rootCreating.type === "file"
                            ? t("newFilePlaceholder")
                            : t("newFolderPlaceholder")
                        }
                        value={rootCreatingName}
                        onChange={(e) => setRootCreatingName(e.target.value)}
                        onBlur={handleRootCreateFinish}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.stopPropagation();
                            handleRootCreateFinish();
                          } else if (e.key === "Escape") {
                            e.stopPropagation();
                            handleRootCreateCancel();
                          }
                        }}
                        className="w-full bg-background border border-border rounded px-2 py-1"
                        autoFocus
                      />
                    </span>
                  </div>
                )}
                {nodes.length === 0 ? (
                  <div className="flex items-center justify-center h-32">
                    <p className="text-xs text-muted-foreground">{t("emptyDirectory")}</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {rootLevelNodes.map((item) => (
                      <TreeNode
                        key={item.fullPath}
                        item={item}
                        level={0}
                        onExpand={expand}
                        onToggleExpand={toggleExpand}
                        onSelect={handleSelect}
                        onDelete={handleDelete}
                        onRename={handleRename}
                        onCreate={handleCreate}
                        onAdd={handleAddContext}
                        onCopy={handleCopy}
                        onCut={handleCut}
                        onPaste={handlePaste}
                        canPaste={canPaste}
                        onReveal={(item) => revealInFileManager(item.fullPath)}
                        cutSourcePath={
                          clipboardItem?.operation === "cut" ? clipboardItem.sourcePath : null
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            }
          />
          <ContextMenuPopup>
            <ContextMenuGroups groups={rootMenuGroups} />
          </ContextMenuPopup>
        </ContextMenu>

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("delete.description", { name: itemToDelete?.fileName })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="outline" />}>
                {t("common.cancel", { ns: "translation" })}
              </AlertDialogClose>
              <Button variant="destructive" onClick={handleConfirmDelete}>
                {t("common.delete", { ns: "translation" })}
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      </div>
    </FileTreeContext.Provider>
  );
}

export default function FilesView() {
  const activeProject = useProjectStore((state) => state.activeProject);
  return <FilesViewComponent project={activeProject} />;
}
