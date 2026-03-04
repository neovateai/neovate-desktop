import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContractRouterClient } from "@orpc/contract";

import { FileTreeItem } from "../../../../shared/plugins/files/contract";
import { filesContract } from "../../../../shared/plugins/files/contract";
import type { Project } from "../../../../shared/features/project/types";
import { usePluginContext } from "../../core/app";
import { TreeNode } from "./tree-node";
import { useProjectStore } from "../../features/project/store";

interface FilesViewProps {
  project: Project | null;
}

type FilesClient = ContractRouterClient<{ files: typeof filesContract }>;

function FilesViewComponent({ project }: FilesViewProps) {
  const { t } = useTranslation();
  const { orpcClient } = usePluginContext();
  const client = orpcClient as FilesClient;

  const [treeData, setTreeData] = useState<FileTreeItem[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (project) {
      loadFileTree();
    }
  }, [project]);

  const loadFileTree = async () => {
    if (!project) return;

    setLoading(true);
    try {
      const { tree } = await client.files.tree({ cwd: project.path });
      setTreeData(tree);
      // 默认展开根目录
      if (tree.length > 0) {
        setExpandedKeys(new Set([project.path]));
      }
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
      // TODO: 在内容面板中打开文件
      console.log("Open file:", item.fullPath);
    }
  };
  const handleDelete = async (item: FileTreeItem) => {
    try {
      const result = await client.files.delete({ path: item.fullPath });
      if (result.success) {
        await loadFileTree(); // TODO:后续刷新逻辑应该是基于监听推送而不是主动刷新
      } else {
        alert(`删除失败: ${result.error}`);
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      alert("删除失败");
    }
  };
  const handleRename = async (oldPath: string, newPath: string) => {
    try {
      const result = await client.files.rename({ oldPath, newPath });
      if (result.success) {
        await loadFileTree(); // TODO:后续刷新逻辑应该是基于监听推送而不是主动刷新
      } else {
        alert(`重命名失败: ${result.error}`);
      }
    } catch (error) {
      console.error("Error renaming file:", error);
      alert("重命名失败");
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
      //   alert(`创建文件失败: ${result.error}`);
      // }
    } catch (error) {
      console.error("Error creating file:", error);
      alert("创建文件失败");
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
      //   alert(`创建文件夹失败: ${result.error}`);
      // }
    } catch (error) {
      console.error("Error creating folder:", error);
      alert("创建文件夹失败");
    }
  };
  /** 添加文件到对话 */
  const handleAddContext = (item: FileTreeItem) => {
    console.log("Add button clicked for:", item);
  };

  if (!project) {
    return (
      <div className="flex h-full flex-col p-3">
        <h2 className="text-xs font-semibold text-muted-foreground">{t("files.title")}</h2>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground">{t("files.noProject")}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col p-3">
        <h2 className="text-xs font-semibold text-muted-foreground">{t("files.title")}</h2>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-3 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-muted-foreground">{t("files.title")}</h2>
      </div>

      <div className="flex-1 overflow-auto">
        {treeData.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-muted-foreground">{t("files.emptyDirectory")}</p>
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
