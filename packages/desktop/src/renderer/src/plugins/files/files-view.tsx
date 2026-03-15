import type { ContractRouterClient } from "@orpc/contract";

import { consumeEventIterator } from "@orpc/client";
import debug from "debug";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import type { Project } from "../../../../shared/features/project/types";

import { FileTreeItem } from "../../../../shared/plugins/files/contract";
import { filesContract } from "../../../../shared/plugins/files/contract";
import { getEmpty2Url } from "../../assets/images";
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
import { useFilesTranslation } from "./i18n";
import { TreeNode } from "./tree-node";

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
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FileTreeItem | null>(null);
  const { resolvedTheme } = useTheme();
  const cwd = project?.path || "";

  useEffect(() => {
    if (!cwd) {
      log("no cwd, clearing tree");
      setTreeData([]);
      setExpandedKeys(new Set());
      setSelectedKey(null);
      return;
    }
    log("starting file watch", { cwd });
    refresh(true);
    // In dev mode, React StrictMode causes an extra mount/unmount cycle, which triggers
    // redundant watch/unwatch calls. The async unwatch may cancel the subsequent watch.
    // Disable StrictMode locally to work around this. Not an issue in production.
    const cancel = consumeEventIterator(client.files.watch({ cwd }), {
      onEvent: (e) => {
        log("fs event", { type: e?.type, path: e?.path });
        if (e?.type !== "content") {
          refresh(); // file system structure changed, refresh file tree
        }
        window.dispatchEvent(new CustomEvent("neovate:fs-change", {}));
      },
    });

    return () => {
      cancel();
    };
  }, [cwd]);

  const refresh = async (reset = false) => {
    if (!project) return;
    log("refresh", { cwd: project.path, reset });
    if (reset) {
      setExpandedKeys(new Set());
      setLoading(true);
    }
    try {
      const { tree } = await client.files.tree({ cwd: project.path });
      setTreeData(tree);
    } catch (error) {
      console.error("Failed to load file tree:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };
  const handleSelect = (item: FileTreeItem) => {
    setSelectedKey(item.fullPath);

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
    log("confirm delete", { path: itemToDelete.fullPath });
    try {
      const result = await client.files.delete({ path: itemToDelete.fullPath });
      if (result.success) {
        if (selectedKey === itemToDelete.fullPath) {
          setSelectedKey(null);
        }
        setExpandedKeys((prev) => {
          const newSet = new Set(prev);
          newSet.delete(itemToDelete.fullPath);
          return newSet;
        });
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
        if (selectedKey === oldPath) {
          setSelectedKey(newPath);
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
      // const result = await client.files.createFile({
      //   path: parentPath,
      //   name,
      // });
      // if (result.success) {
      //   // refresh file tree
      //   await loadFileTree();
      // } else {
      //   alert(t("error.createFileFailed"));
      // }
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
      // const result = await client.files.createFolder({
      //   path: parentPath,
      //   name,
      // });
      // if (result.success) {
      //   // refresh file tree
      //   await loadFileTree();
      // } else {
      //   alert(t("error.createFolderFailed"));
      // }
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
        <h2 className="text-xs font-semibold text-muted-foreground">{t("title")}</h2>
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
        <h2 className="text-xs font-semibold text-muted-foreground">{t("title")}</h2>
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
        <h2 className="text-xs font-semibold text-muted-foreground">{t("title")}</h2>
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
                expandedKeys={expandedKeys}
                onToggleExpand={handleToggleExpand}
                selectedKey={selectedKey}
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
