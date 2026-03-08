import { useEffect, useState } from "react";
import type { ContractRouterClient } from "@orpc/contract";
import { consumeEventIterator } from "@orpc/client";
import debug from "debug";

import { FileTreeItem } from "../../../../shared/plugins/files/contract";
import { filesContract } from "../../../../shared/plugins/files/contract";
import type { Project } from "../../../../shared/features/project/types";
import { usePluginContext } from "../../core/app";
import { TreeNode } from "./tree-node";
import { useProjectStore } from "../../features/project/store";
import { useFilesTranslation } from "./i18n";

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

  const cwd = project?.path || "";

  useEffect(() => {
    if (!cwd) {
      setTreeData([]);
      setExpandedKeys(new Set());
      setSelectedKey(null);
      return;
    }
    refresh(true);
    // 本地开发调试时，由于严格模式问题，会额外产生一次 useEffect 挂载卸载，导致触发多余的监听和取消监听
    // 而取消监听有异步现象，会导致后面的一次监听后才执行前一次的取消监听，导致监听器不生效
    // 本地调试时需要关闭严格模式 StrictMode。生产环境无此问题。
    const cancel = consumeEventIterator(client.files.watch({ cwd }), {
      onEvent: () => refresh(),
    });

    return () => {
      cancel();
    };
  }, [cwd]);

  const refresh = async (reset = false) => {
    if (!project) return;
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
      // @ts-ignore 避免 dispatchEvent 时未初始化完成
      window.pendingEditorRequest = { fullPath: item.fullPath };
    }
  };
  const handleDelete = async (item: FileTreeItem) => {
    try {
      const result = await client.files.delete({ path: item.fullPath });
      if (result.success) {
        if (selectedKey === item.fullPath) {
          setSelectedKey(null);
        }
        setExpandedKeys((prev) => {
          const newSet = new Set(prev);
          newSet.delete(item.fullPath);
          return newSet;
        });
      } else {
        alert(t("error.deleteFailed", { error: result.error }));
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      alert(t("error.deleteFailed", { error: String(error) }));
    }
  };
  const handleRename = async (oldPath: string, newPath: string) => {
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
  // TODO: 待实现
  const handleCreateFile = async (parentPath: string, name: string) => {
    try {
      alert("Coming soon");
      console.log(parentPath, name);
      // const result = await client.files.createFile({
      //   path: parentPath,
      //   name,
      // });
      // if (result.success) {
      //   // 刷新文件树
      //   await loadFileTree();
      // } else {
      //   alert(t("error.createFileFailed"));
      // }
    } catch (error) {
      console.error("Error creating file:", error);
      alert(t("error.createFileFailed"));
    }
  };
  // TODO: 待实现
  const handleCreateFolder = async (parentPath: string, name: string) => {
    try {
      alert("Coming soon");
      console.log(parentPath, name);
      // const result = await client.files.createFolder({
      //   path: parentPath,
      //   name,
      // });
      // if (result.success) {
      //   // 刷新文件树
      //   await loadFileTree();
      // } else {
      //   alert(t("error.createFolderFailed"));
      // }
    } catch (error) {
      console.error("Error creating folder:", error);
      alert(t("error.createFolderFailed"));
    }
  };
  /** 添加文件到对话 */
  const handleAddContext = (item: FileTreeItem) => {
    log("insert-mention dispatching path=%s", item.relPath);
    window.dispatchEvent(
      new CustomEvent("neovate:insert-mention", {
        detail: { path: item.relPath },
      }),
    );
  };

  if (!project) {
    return (
      <div className="flex h-full flex-col p-3">
        <h2 className="text-xs font-semibold text-muted-foreground">{t("title")}</h2>
        <div className="flex flex-1 items-center justify-center">
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

      <div className="flex-1 overflow-auto">
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
    </div>
  );
}

export default function FilesView() {
  const activeProject = useProjectStore((state) => state.activeProject);
  return <FilesViewComponent project={activeProject} />;
}
