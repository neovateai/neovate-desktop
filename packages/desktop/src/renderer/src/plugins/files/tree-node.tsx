import { HugeiconsIcon } from "@hugeicons/react";
import { File02Icon, Folder02Icon } from "@hugeicons/core-free-icons";
import { ChevronRight, ChevronDown, FilePlus, FolderPlus, Edit, Trash2, Plus } from "lucide-react";
import { useState } from "react";
import { useFilesTranslation } from "./i18n";
import { cn } from "../../lib/utils";
import type { FileTreeItem } from "../../../../shared/plugins/files/contract";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuPopup,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../components/ui/context-menu";

interface TreeNodeProps {
  item: FileTreeItem;
  level: number;
  expandedKeys: Set<string>;
  onToggleExpand: (key: string) => void;
  selectedKey?: string | null;
  onSelect?: (item: FileTreeItem) => void;
  onDelete?: (item: FileTreeItem) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onCreateFile?: (parentPath: string, name: string) => void;
  onCreateFolder?: (parentPath: string, name: string) => void;
  onAdd?: (item: FileTreeItem) => void;
}

function FileLangIcon(props: { path: string; size?: number }) {
  const { path = "", size = 16 } = props;
  const filename = path.split("/").pop() || path;
  const suffix = filename.split(".").pop();

  return (
    <div
      className="seti-icon"
      data-lang={suffix}
      style={{ fontSize: size, width: size, height: size, lineHeight: 1 }}
    ></div>
  );
}

export function TreeNode({
  item,
  level,
  expandedKeys,
  onToggleExpand,
  selectedKey,
  onSelect,
  onDelete,
  onRename,
  onCreateFile,
  onCreateFolder,
  onAdd,
}: TreeNodeProps) {
  const { t } = useFilesTranslation();
  const { fileName = "" } = item || {};
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState(fileName);
  const [isCreating, setIsCreating] = useState(false);
  const [creatingType, setCreatingType] = useState<"file" | "folder" | null>(null);
  const [creatingName, setCreatingName] = useState("");
  const [isHovered, setIsHovered] = useState(false);

  const isExpanded = expandedKeys.has(item.fullPath);
  const isSelected = selectedKey === item.fullPath;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.isFolder) {
      onToggleExpand(item.fullPath);
    }
    if (onSelect) {
      onSelect(item);
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAdd) {
      onAdd(item);
    }
  };

  const menuItems = [
    {
      label: t("contextMenu.newFile"),
      icon: <FilePlus size={14} />,
      action: () => handleCreateFile(),
    },
    {
      label: t("contextMenu.newFolder"),
      icon: <FolderPlus size={14} />,
      action: () => handleCreateFolder(),
    },
    ...(item.relPath !== ""
      ? [
          {
            label: t("contextMenu.rename"),
            icon: <Edit size={14} />,
            action: () => handleStartRename(),
          },
          {
            label: t("contextMenu.delete"),
            icon: <Trash2 size={14} />,
            action: () => handleDelete(),
            variant: "destructive" as const,
          },
        ]
      : []),
  ];

  const handleStartRename = () => {
    setIsEditing(true);
    setEditingName(fileName);
  };

  const handleFinishRename = () => {
    if (editingName && editingName !== fileName && onRename) {
      const parentPath = item.fullPath.substring(0, item.fullPath.length - fileName.length);
      const newPath = parentPath + editingName;
      onRename(item.fullPath, newPath);
    }
    setIsEditing(false);
  };

  const handleCancelRename = () => {
    setIsEditing(false);
    setEditingName(fileName);
  };

  const handleDelete = () => {
    if (onDelete && confirm(t("confirmDelete", { fileName }))) {
      onDelete(item);
    }
  };

  const handleCreateFile = () => {
    setIsCreating(true);
    setCreatingType("file");
    setCreatingName("");
  };

  const handleCreateFolder = () => {
    setIsCreating(true);
    setCreatingType("folder");
    setCreatingName("");
  };

  const handleFinishCreate = () => {
    if (creatingName) {
      if (creatingType === "file" && onCreateFile) {
        onCreateFile(item.fullPath, creatingName);
      } else if (creatingType === "folder" && onCreateFolder) {
        onCreateFolder(item.fullPath, creatingName);
      }
    }
    setIsCreating(false);
    setCreatingType(null);
    setCreatingName("");
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setCreatingType(null);
    setCreatingName("");
  };

  const paddingLeft = level * 12 + 8;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent hover:text-accent-foreground rounded-sm relative group",
              isSelected && "bg-accent text-accent-foreground",
            )}
            style={{ paddingLeft: `${paddingLeft}px` }}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="w-4 h-4 flex items-center justify-center">
              {item.isFolder &&
                (isExpanded ? (
                  <ChevronDown size={14} strokeWidth={1.5} />
                ) : (
                  <ChevronRight size={14} strokeWidth={1.5} />
                ))}
            </div>

            {item.isFolder ? (
              <HugeiconsIcon
                icon={Folder02Icon}
                size={16}
                strokeWidth={1.5}
                className="text-yellow-500 dark:text-yellow-400"
              />
            ) : (
              <FileLangIcon path={item.relPath}></FileLangIcon>
            )}

            {isEditing ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleFinishRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleFinishRename();
                  if (e.key === "Escape") handleCancelRename();
                }}
                className="flex-1 text-xs bg-background border border-border rounded px-1 py-0.5 ml-1"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 text-xs ml-1 cursor-pointer truncate" title={item.fullPath}>
                {fileName}
              </span>
            )}

            {isHovered && (
              <button
                onClick={handleAddClick}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-sm hover:bg-border opacity-0 transition-opacity"
                style={{ opacity: isHovered ? 1 : 0 }}
                title={t("contextMenu.newFile")}
              >
                <Plus size={12} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuPopup>
          {menuItems.map((menuItem, index) => (
            <div key={index}>
              {index === 2 && <ContextMenuSeparator />}
              <ContextMenuItem onClick={menuItem.action} data-variant={menuItem.variant}>
                {menuItem.icon}
                {menuItem.label}
              </ContextMenuItem>
            </div>
          ))}
        </ContextMenuPopup>
      </ContextMenu>

      {isCreating && (
        <div className="flex items-center gap-1 px-2 py-1 hover:bg-accent hover:text-accent-foreground rounded-sm">
          <div className="w-4 h-4 flex items-center justify-center">
            <HugeiconsIcon
              icon={creatingType === "folder" ? Folder02Icon : File02Icon}
              size={14}
              strokeWidth={1.5}
            />
          </div>
          <span className="flex-1 text-xs ml-1 cursor-pointer">
            <input
              type="text"
              placeholder={
                creatingType === "file" ? t("newFilePlaceholder") : t("newFolderPlaceholder")
              }
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
              onBlur={handleFinishCreate}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFinishCreate();
                if (e.key === "Escape") handleCancelCreate();
              }}
              className="w-full bg-background border border-border rounded px-1 py-0.5"
              autoFocus
            />
          </span>
        </div>
      )}

      {isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <TreeNode
              key={child.fullPath}
              item={child}
              level={level + 1}
              expandedKeys={expandedKeys}
              onToggleExpand={onToggleExpand}
              selectedKey={selectedKey}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onAdd={onAdd}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default TreeNode;
