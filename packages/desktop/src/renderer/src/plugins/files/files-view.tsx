import type { ContractRouterClient } from "@orpc/contract";

import { consumeEventIterator } from "@orpc/client";
import debug from "debug";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import type { Project } from "../../../../shared/features/project/types";

import { FileTreeItem } from "../../../../shared/plugins/files/contract";
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
import { usePluginContext } from "../../core/app";
import { useProjectStore } from "../../features/project/store";
import { useOperationKeys } from "./hooks/useOperationKeys";
import { useTreeUpdater } from "./hooks/useTreeUpdater";
import { useFilesTranslation } from "./i18n";
import { TreeNode } from "./tree-node";
import { convertPathListDepth } from "./utils/sort";

const log = debug("neovate:files-view");

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
  const { resolvedTheme } = useTheme();
  const expandedKeys = useOperationKeys();
  const selectedKeys = useOperationKeys();
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
          }, 500),
        );
      },
      onError: (e) => {
        log("file watch error: consumeEventIterator", e);
      },
    });
    watchersRef.current.set(dir, cancel);
  }

  function stopWatcher(dir: string) {
    const cancel = watchersRef.current.get(dir);
    if (cancel) {
      log("stopping watcher", { dir });
      cancel();
      watchersRef.current.delete(dir);
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

  // --- Keyboard shortcut: Enter to rename selected item ---
  const findTreeItemByPath = (items: FileTreeItem[], path: string): FileTreeItem | null => {
    for (const item of items) {
      if (item.fullPath === path) return item;
      if (item.children) {
        const found = findTreeItemByPath(item.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      if (e.key === "Enter" && selectedKeys.keys.size === 1 && !editingKey) {
        const selectedPath = [...selectedKeys.keys][0];
        const item = findTreeItemByPath(treeData, selectedPath);
        // Skip root item (empty relPath)
        if (item && item.relPath !== "") {
          setEditingKey(selectedPath);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedKeys.keys, editingKey, treeData]);

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

  const getChildrenKeys = (parentPath: string, expandedSet: Set<string>) => {
    const descendants: string[] = [];
    for (const key of expandedSet) {
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
      const subKeys = getChildrenKeys(key, expandedKeys.keys);
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
        alert(t("error.deleteFailed", { error: result.error }));
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      alert(t("error.deleteFailed", { error: String(error) }));
    } finally {
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    }
  };
  const handleRename = async (oldPath: string, newPath: string) => {
    log("rename", { oldPath, newPath });
    try {
      const result = await client.files.rename({ oldPath, newPath });
      if (result.success) {
        if (selectedKeys.has(oldPath)) {
          selectedKeys.replace(oldPath, newPath); // rename 场景，保持原本对象的文件夹选中状态
        }
      } else {
        alert(t("error.renameFailed", { error: result.error }));
      }
    } catch (error) {
      console.error("Error renaming file:", error);
      alert(t("error.renameFailed", { error: String(error) }));
    }
  };
  // TODO: not yet implemented
  const handleCreateFile = async (parentPath: string, name: string) => {
    try {
      alert("Coming soon");
      log("create file", { parentPath, name });
    } catch (error) {
      console.error("Error creating file:", error);
      alert(t("error.createFileFailed"));
    }
  };
  // TODO: not yet implemented
  const handleCreateFolder = async (parentPath: string, name: string) => {
    try {
      alert("Coming soon");
      log("create folder", { parentPath, name });
    } catch (error) {
      console.error("Error creating folder:", error);
      alert(t("error.createFolderFailed"));
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

      <div className="flex-1 overflow-auto -mr-2.5">
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
