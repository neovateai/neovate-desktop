import type { ContractRouterClient } from "@orpc/contract";

import { consumeEventIterator } from "@orpc/client";
import debug from "debug";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import type { Project } from "../../../../shared/features/project/types";

import { FileTreeItem } from "../../../../shared/plugins/files/contract";
import { filesContract } from "../../../../shared/plugins/files/contract";
import { getEmpty2Url } from "../../assets/images";
import { layoutStore, useLayoutStore } from "../../components/app-layout/store";
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
import { toastManager } from "../../components/ui/toast";
import { usePluginContext } from "../../core/app";
import { useProjectStore } from "../../features/project/store";
import { useOperationKeys } from "./hooks/useOperationKeys";
import { useTreeKeyboardShortcuts } from "./hooks/useTreeKeyboardShortcuts";
import { useTreeUpdater } from "./hooks/useTreeUpdater";
import { useFilesTranslation } from "./i18n";
import { TreeNode } from "./tree-node";
import { getCreateErrorMessage } from "./utils/error";
import { convertPathListDepth } from "./utils/sort";

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

  const [treeData, setTreeData] = useState<FileTreeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FileTreeItem | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [clipboardItem, setClipboardItem] = useState<{
    sourcePath: string;
    operation: "copy" | "cut";
  } | null>(null);
  const { resolvedTheme } = useTheme();
  const expandedKeys = useOperationKeys(); // dirs expanded or ever expanded
  const selectedKeys = useOperationKeys();
  const loadedKeys = useOperationKeys(); // dirs loaded with data and file-watcher
  const cwd = project?.path || "";
  const { update: updateChildrenInTree, batchUpdate } = useTreeUpdater({
    cwd,
    setTreeData,
  });

  const isVisible = useLayoutStore(
    (s) =>
      !s.panels.secondarySidebar?.collapsed && s.panels.secondarySidebar?.activeView === "files",
  );

  // Track active watcher cancel functions per directory
  const watchersRef = useRef<Map<string, () => void>>(new Map());
  // Debounce timers for per-directory refresh
  const refreshTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Debounce timer for revealFile
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Track last revealed path to avoid duplicate work
  const lastRevealedPathRef = useRef<string | null>(null);
  // Pending file path to reveal when panel becomes visible
  const pendingRevealPathRef = useRef<string | null>(null);

  // --- Lazy tree loading (Section 3) ---
  async function fetchChildren(dir: string) {
    if (!cwd) return [];
    try {
      const { tree } = await client.files.tree({ cwd: dir, root: cwd });
      return tree;
    } catch (error) {
      log("failed to fetch children", { dir, error });
      return [];
    }
  }

  // --- Watcher management (Section 2b) ---
  function startWatcher(dir: string) {
    if (watchersRef.current.has(dir)) return;
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
            const children = await fetchChildren(dir);
            updateChildrenInTree(dir, children);
          }, REFRESH_DEBOUNCE_MS),
        );
      },
      onError: (e) => {
        log("file watch error: consumeEventIterator", e);
      },
    });
    watchersRef.current.set(dir, cancel);
    loadedKeys.add(dir);
  }

  function stopWatcher(dir: string) {
    const cancel = watchersRef.current.get(dir);
    if (cancel) {
      log("stopping watcher", { dir });
      cancel();
      watchersRef.current.delete(dir);
      loadedKeys.remove(dir);
    }
    const timer = refreshTimersRef.current.get(dir);
    if (timer) {
      clearTimeout(timer);
      refreshTimersRef.current.delete(dir);
    }
  }

  function stopAllWatchers() {
    log("stopping all watchers", { count: watchersRef.current.size });
    for (const cancel of watchersRef.current.values()) {
      cancel();
    }
    watchersRef.current.clear();
    loadedKeys.reset();
    for (const timer of refreshTimersRef.current.values()) {
      clearTimeout(timer);
    }
    refreshTimersRef.current.clear();
  }

  // --- Lifecycle: start/stop watching based on visibility + cwd ---
  useEffect(() => {
    if (!cwd || !isVisible) {
      stopAllWatchers();
      if (!cwd) {
        setTreeData([]);
        expandedKeys.reset();
        selectedKeys.reset();
      }
      return;
    }

    // Panel became visible or cwd changed: load root and start root watcher
    log("panel visible, loading root", { cwd });
    setLoading(true);
    fetchChildren(cwd).then((children) => {
      setTreeData(children);
      setLoading(false);
      // After root is loaded, restore all expanded directories
      restoreExpandedDirectories(expandedKeys.keys);
    });
    startWatcher(cwd);

    return () => {
      stopAllWatchers();
    };
  }, [cwd, isVisible]);

  // --- Keyboard shortcuts ---
  useTreeKeyboardShortcuts({
    cwd,
    selectedKeys: selectedKeys.keys,
    editingKey,
    treeData,
    clipboardItem,
    onSetEditingKey: setEditingKey,
    onCopy: (node) => handleCopy(node),
    onCut: (node) => handleCut(node),
    onPaste: (node) => handlePaste(node),
  });

  /**
   * 传入一组目录路径，该函数将分批加载路径对应的数据并启动监听，必须确保路径依赖的完备性
   */
  const restoreExpandedDirectories = async (restoreKeys: Set<string>) => {
    if (!cwd || restoreKeys.size === 0) return;
    log("restoring expanded directories", { count: restoreKeys.size });

    // 按层级分批加载目录数据（确保父级先加载）
    const depthList = convertPathListDepth(restoreKeys, cwd);
    const allUpdates: { parentPath: string; children: FileTreeItem[] }[] = [];
    const dirsToWatch: string[] = [];

    for (let i = 0; i < depthList.length; i++) {
      const dirs = depthList[i];
      log(`loading depth ${i + 1} directories`, { dirs });

      // 同层级并行加载
      const results = await Promise.allSettled(
        dirs.map(async (key) => {
          try {
            const children = await fetchChildren(key);
            return { parentPath: key, children };
          } catch (error) {
            log("failed to restore directory", { key, error });
            return null;
          }
        }),
      );

      // 收集本层级的更新
      for (const r of results) {
        if (r.status === "fulfilled" && r.value !== null) {
          allUpdates.push(r.value);
          dirsToWatch.push(r.value.parentPath);
        }
      }
    }

    // 所有层级加载完成后，一次性合并更新
    if (allUpdates.length > 0) {
      batchUpdate(allUpdates);
      dirsToWatch.forEach((dir) => startWatcher(dir));
    }
  };

  const getChildrenKeys = (parentPath: string, allKeys: Set<string>) => {
    const descendants: string[] = [];
    for (const key of allKeys) {
      if (key.startsWith(parentPath + "/")) {
        descendants.push(key);
      }
    }
    return descendants;
  };

  const handleToggleExpand = async (key: string) => {
    const isCurrentlyExpanded = expandedKeys.has(key);

    if (isCurrentlyExpanded) {
      // 关闭目录，清理下属的文件监听器。（展开状态仅修正当前节点）
      expandedKeys.remove(key);
      const subKeys = getChildrenKeys(key, loadedKeys.keys);
      const keysToUnwatch = [key, ...subKeys];
      for (const k of keysToUnwatch) {
        stopWatcher(k);
      }
    } else {
      const updated = expandedKeys.add(key);
      restoreExpandedDirectories(updated); // 恢复打开的key 和其下级key 的数据和监听状态
    }
  };

  const handleSelect = (item: FileTreeItem) => {
    selectedKeys.only(item.fullPath);

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
  const handleDelete = (item: FileTreeItem) => {
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
        if (selectedKeys.has(targetPath)) {
          selectedKeys.remove(targetPath, true);
        }
        if (expandedKeys.has(targetPath)) {
          expandedKeys.remove(targetPath, true);
        }
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
        if (selectedKeys.has(oldPath)) {
          selectedKeys.replace(oldPath, newPath); // rename 场景，保持原本对象的文件夹选中状态
        }
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

  const handleCreateFile = async (parentPath: string, name: string) => {
    const fullPath = `${parentPath}/${name}`;
    log("create file", { parentPath, name, fullPath });
    try {
      const result = await client.files.createFile({ path: fullPath });
      if (result.success) {
        selectedKeys.only(fullPath);
        // Watcher will automatically sync the file system changes
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

  const handleCreateFolder = async (parentPath: string, name: string) => {
    const fullPath = `${parentPath}/${name}`;
    log("create folder", { parentPath, name, fullPath });
    try {
      const result = await client.files.createFolder({ path: fullPath });
      if (result.success) {
        selectedKeys.only(fullPath);
        // Expand parent folder to show the new folder
        if (!expandedKeys.has(parentPath)) {
          expandedKeys.add(parentPath);
        }
        // Watcher will automatically sync the file system changes
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
  const handleAddContext = (item: FileTreeItem) => {
    log("insert-chat dispatching mention=%s", item.relPath);
    window.dispatchEvent(
      new CustomEvent("neovate:insert-chat", {
        detail: { mentions: [{ id: item.relPath, label: item.relPath }] },
      }),
    );
  };

  /** Copy file to clipboard */
  const handleCopy = (item: FileTreeItem) => {
    log("copy to clipboard", { sourcePath: item.fullPath });
    setClipboardItem({ sourcePath: item.fullPath, operation: "copy" });
  };

  /** Cut file to clipboard */
  const handleCut = (item: FileTreeItem) => {
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

  /** Reveal file in tree: expand all parent directories and select the file */
  const revealFile = async (fullPath: string, forceReveal = false) => {
    log("revealFile called", { fullPath, cwd });
    if (!cwd || !fullPath.startsWith(cwd)) {
      return;
    }
    // Only reveal if the files panel is currently visible (unless forced)
    if (!forceReveal) {
      const { collapsed, activeView } = layoutStore.getState().panels.secondarySidebar || {};
      if (collapsed || activeView !== "files") {
        // Save the path to reveal later when panel becomes visible
        pendingRevealPathRef.current = fullPath;
        log("revealFile deferred: files panel not active, saved pending path", {
          fullPath,
        });
        return;
      }
    }
    // Clear pending path since we're revealing now
    pendingRevealPathRef.current = null;

    // Collect all parent directories (from root to file's direct parent)
    const allParentDirs: string[] = [];
    let currentPath = fullPath;
    while (currentPath !== cwd) {
      const lastSlash = currentPath.lastIndexOf("/");
      if (lastSlash === -1) break;
      const parentDir = currentPath.substring(0, lastSlash);
      if (!parentDir || !parentDir.startsWith(cwd)) break;
      allParentDirs.unshift(parentDir);
      currentPath = parentDir;
    }
    // Find which directories need to be loaded
    const dirsToLoad = allParentDirs.filter((dir) => !loadedKeys.has(dir));

    // 已经加载的路径，需要考虑其下级的加载情况，还原历史上已经被打开加载过的旁支节点
    const ancestorDirsToRefresh = allParentDirs.filter((dir) => loadedKeys.has(dir));

    // Find all expanded but not loaded descendants under these ancestors
    // When ancestors are refreshed, these descendants' data would be lost
    const siblingDirsToRestore: string[] = [];
    for (const ancestorDir of ancestorDirsToRefresh) {
      for (const expandedKey of expandedKeys.keys) {
        if (
          expandedKey.startsWith(ancestorDir + "/") &&
          !loadedKeys.has(expandedKey) &&
          !dirsToLoad.includes(expandedKey)
        ) {
          siblingDirsToRestore.push(expandedKey);
        }
      }
    }

    // Combine all directories that need data restoration
    const dirsToRestore = new Set([...dirsToLoad, ...siblingDirsToRestore]);

    console.log("revealFile dirsToExpand", {
      allParentDirs,
      dirsToLoad,
      ancestorDirsToRefresh,
      siblingDirsToRestore,
      dirsToRestore,
    });

    // Expand directories that need it
    if (dirsToLoad.length > 0) {
      for (const dir of dirsToLoad) {
        expandedKeys.add(dir);
      }
    }
    await restoreExpandedDirectories(dirsToRestore);

    lastRevealedPathRef.current = fullPath;
    if (!selectedKeys.has(fullPath)) {
      selectedKeys.only(fullPath);
      // Scroll the selected node into view
      requestAnimationFrame(() => {
        const node = document.querySelector(`[data-full-path="${fullPath}"]`);
        if (node) {
          node.scrollIntoView({ block: "center" });
        }
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
        revealFile(pathToReveal, true);
      }, PANEL_VISIBLE_DELAY_MS);
    }
  }, [isVisible]);

  // --- Listen for editor tabs change to reveal active file in tree ---
  // Use ref to store the latest revealFile function
  const revealFileRef = useRef(revealFile);
  revealFileRef.current = revealFile;

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
          revealFileRef.current(activeTab.fullPath);
        }, DEBOUNCE_REVEAL_MS);
      }
    };

    log("adding editor-tabs-change listener");
    window.addEventListener("neovate:editor-tabs-change", handleEditorTabsChange as EventListener);
    return () => {
      log("removing editor-tabs-change listener");
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

  return (
    <div className="flex h-full flex-col p-3 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{t("title")}</h2>
      </div>

      <div
        className="flex-1 overflow-auto -mr-2.5"
        onClick={(e) => {
          // Only clear selection when clicking the empty area (not tree nodes)
          if (e.target === e.currentTarget) {
            selectedKeys.reset();
          }
        }}
      >
        {treeData.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-muted-foreground">{t("emptyDirectory")}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {treeData.map((item) => (
              <TreeNode
                key={item.fullPath}
                item={item}
                level={0}
                expandedKeys={expandedKeys.keys}
                onToggleExpand={handleToggleExpand}
                selectedKeys={selectedKeys.keys}
                editingKey={editingKey}
                onEditingKeyChange={setEditingKey}
                onSelect={handleSelect}
                onDelete={handleDelete}
                onRename={handleRename}
                onCreateFile={handleCreateFile}
                onCreateFolder={handleCreateFolder}
                onAdd={handleAddContext}
                onCopy={handleCopy}
                onCut={handleCut}
                onPaste={handlePaste}
                canPaste={canPaste}
                cutSourcePath={clipboardItem?.operation === "cut" ? clipboardItem.sourcePath : null}
              />
            ))}
          </div>
        )}
      </div>

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
  );
}

export default function FilesView() {
  const activeProject = useProjectStore((state) => state.activeProject);
  return <FilesViewComponent project={activeProject} />;
}
