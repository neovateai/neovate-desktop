import { File02Icon, Folder02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ChevronRight, ChevronDown, Plus } from "lucide-react";
import React, { useState, useEffect, useContext } from "react";

import type { MenuGroup } from "./menu-types";

import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuPopup,
} from "../../components/ui/context-menu";
import { cn } from "../../lib/utils";
import { ContextMenuGroups } from "./context-menu-groups";
import { FileNodeItem, FileTreeContext } from "./hooks/useFileData";
import { useFilesTranslation } from "./i18n";
import { buildClipboardMenu, buildCreationMenu, buildPathMenu } from "./menu-utils";

interface TreeNodeProps {
  item: FileNodeItem;
  level: number;
  cutSourcePath?: string | null;
  onToggleExpand: (key: string) => void;
  onExpand: (key: string) => void;
  onSelect?: (item: FileNodeItem) => void;
  onDelete?: (item: FileNodeItem) => void;
  onRename?: (oldPath: string, newPath: string) => Promise<boolean | void> | boolean | void;
  onCreate?: (newNode: { parentPath: string; name: string; isFolder: boolean }) => void;
  onAdd?: (item: FileNodeItem) => void;
  onCopy?: (item: FileNodeItem) => void;
  onCut?: (item: FileNodeItem) => void;
  onPaste?: (targetPath: string) => void;
  canPaste?: (targetPath: string) => boolean;
  onReveal?: (item: FileNodeItem) => void;
}

function FileLangIcon(props: { path: string; size?: number }) {
  const { path = "", size = 18 } = props;
  const filename = path.split("/").pop() || path;
  const suffix = filename.split(".").pop();

  return (
    <div
      className="seti-icon"
      data-lang={suffix}
      data-name={filename}
      style={{ fontSize: size, width: 12, height: 12, lineHeight: `12px` }}
    ></div>
  );
}

export function TreeNode({
  item,
  level,
  onExpand,
  onToggleExpand,
  onSelect,
  onDelete,
  onRename,
  onCreate,
  onAdd,
  onCopy,
  onCut,
  onPaste,
  canPaste,
  cutSourcePath,
  onReveal,
}: TreeNodeProps) {
  const {
    nodes,
    expandedKeys,
    selectedKeys,
    renamingKey,
    renameStart,
    renameEnd,
    pendingCreation,
    createStart,
    createEnd,
  } = useContext(FileTreeContext);
  const childNodes = nodes.filter((i) => i.parentPath === item.fullPath);
  const { t } = useFilesTranslation();
  const { fileName = "" } = item || {};

  const [editingName, setEditingName] = useState(fileName);
  const [creatingName, setCreatingName] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  // Optimistic UI: pending name for rename operation
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);

  const isEditing = renamingKey === item.fullPath;
  const isCreating = item.isFolder && pendingCreation?.parentPath === item.fullPath;
  const creatingType = isCreating ? pendingCreation?.type : "";

  useEffect(() => {
    if (isEditing) {
      setEditingName(fileName);
    }
  }, [isEditing, fileName]);

  // Clear pendingFileName when tree refreshes with new name
  useEffect(() => {
    if (pendingFileName && fileName === pendingFileName) {
      setPendingFileName(null);
    }
  }, [fileName, pendingFileName]);

  const isExpanded = expandedKeys.has(item.fullPath);
  const isSelected = selectedKeys.has(item.fullPath);
  const isCutting = cutSourcePath === item.fullPath;
  const [showCreator, setShowCreator] = useState(false);

  // 用户触发新建-触发展开，进入创建态-展开完成&处于创建态-出现creator
  useEffect(() => {
    if (item.isFolder && expandedKeys.has(item.fullPath) && isCreating) {
      setShowCreator(true);
    } else {
      setShowCreator(false);
    }
  }, [item.fullPath, item.isFolder, expandedKeys, isCreating]);

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
    onAdd?.(item);
  };

  const getTargetDir = () => {
    if (item.isFolder) {
      return item.fullPath;
    }
    return item.fullPath.substring(0, item.fullPath.lastIndexOf("/"));
  };
  const canPasteHere = canPaste?.(getTargetDir()) ?? false;

  const handleStartRename = () => {
    renameStart?.(item.fullPath);
    setEditingName(fileName);
  };

  const handleFinishRename = async () => {
    if (editingName && editingName !== fileName && onRename) {
      const parentPath = item.fullPath.substring(0, item.fullPath.length - fileName.length);
      const newPath = parentPath + editingName;
      // Optimistic UI: set pending name first
      setPendingFileName(editingName);
      renameEnd?.();
      const result = await onRename(item.fullPath, newPath);
      // Rollback if rename failed (result is false)
      if (result === false) {
        setPendingFileName(null);
      }
    } else {
      renameEnd?.();
    }
  };

  const handleCancelRename = () => {
    renameEnd?.();
    setEditingName(fileName);
  };

  const handleDelete = () => {
    onDelete?.(item);
  };

  const getParentPath = () => {
    // If item is a folder, create inside it; if file, create in same directory
    return item.isFolder
      ? item.fullPath
      : item.fullPath.substring(0, item.fullPath.lastIndexOf("/"));
  };

  const handleCreateFile = () => {
    if (!item.isFolder) {
      return;
    }
    onExpand?.(item.fullPath);
    createStart?.("file", item.fullPath);
    setCreatingName("");
  };

  const handleCreateFolder = () => {
    if (!item.isFolder) {
      return;
    }
    createStart?.("folder", item.fullPath);
    onExpand?.(item.fullPath);
    setCreatingName("");
  };

  const handleFinishCreate = () => {
    if (creatingName && creatingType) {
      const parentPath = getParentPath();
      onCreate?.({
        parentPath,
        name: creatingName,
        isFolder: creatingType === "folder",
      });
    }
    createEnd?.();
    setCreatingName("");
  };

  const handleCancelCreate = () => {
    createEnd?.();
    setCreatingName("");
  };

  const buildMenu = (): MenuGroup[] => {
    const groups: MenuGroup[] = [];

    // Group 1: New file/folder, Reveal in Finder
    const creationItems = buildCreationMenu(t, {
      onCreateFile: item.isFolder ? handleCreateFile : undefined,
      onCreateFolder: item.isFolder ? handleCreateFolder : undefined,
      onReveal: item.relPath !== "" ? () => onReveal?.(item) : undefined,
    });
    if (creationItems.length > 0) {
      groups.push(creationItems);
    }

    // Group 2: Copy, Cut, Paste
    const clipboardItems = buildClipboardMenu(t, {
      onCopy: item.relPath !== "" ? () => onCopy?.(item) : undefined,
      onCut: item.relPath !== "" ? () => onCut?.(item) : undefined,
      onPaste: item.isFolder && canPasteHere ? () => onPaste?.(getTargetDir()) : undefined,
    });
    if (clipboardItems.length > 0) {
      groups.push(clipboardItems);
    }

    // Group 3: Copy Path
    if (item.relPath !== "") {
      groups.push(buildPathMenu(t, { fullPath: item.fullPath, relativePath: item.relPath }));
    }

    // Group 4: Rename, Delete (delete is always last)
    if (item.relPath !== "") {
      groups.push([
        { label: t("contextMenu.rename"), action: handleStartRename },
        { label: t("contextMenu.delete"), action: handleDelete, variant: "destructive" },
      ]);
    }

    return groups;
  };

  const menuGroups = buildMenu();

  const paddingLeft = level * 16 + 12;

  const renderCreator = () => {
    return (
      <div className="flex items-center gap-1 px-2 py-1 hover:bg-accent hover:text-accent-foreground rounded-sm">
        <div className="w-4 h-4 flex items-center justify-center">
          <HugeiconsIcon
            icon={creatingType === "folder" ? Folder02Icon : File02Icon}
            size={18}
            strokeWidth={1.5}
          />
        </div>
        <span className="flex-1 text-sm ml-2 cursor-pointer">
          <input
            type="text"
            placeholder={
              creatingType === "file" ? t("newFilePlaceholder") : t("newFolderPlaceholder")
            }
            value={creatingName}
            onChange={(e) => setCreatingName(e.target.value)}
            onBlur={() => {
              handleFinishCreate();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                handleFinishCreate();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                handleCancelCreate();
              }
            }}
            className="w-full bg-background border border-border rounded px-2 py-1"
            autoFocus
          />
        </span>
      </div>
    );
  };

  return (
    <>
      <ContextMenu
        onOpenChange={(open) => {
          if (open) {
            onSelect?.(item);
          }
        }}
      >
        <ContextMenuTrigger>
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-accent hover:text-accent-foreground rounded-sm relative group",
              isSelected && "bg-accent text-accent-foreground",
              isCutting && "opacity-50",
            )}
            style={{ paddingLeft: `${paddingLeft}px` }}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            data-full-path={item.fullPath}
          >
            {item.isFolder ? (
              <div className="w-3 h-5 flex items-center justify-center">
                {isExpanded ? (
                  <ChevronDown size={14} strokeWidth={1.5} />
                ) : (
                  <ChevronRight size={14} strokeWidth={1.5} />
                )}
              </div>
            ) : (
              <FileLangIcon path={item.relPath} size={18}></FileLangIcon>
            )}

            {isEditing ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleFinishRename}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleFinishRename();
                  if (e.key === "Escape") handleCancelRename();
                }}
                className="flex-1 text-sm bg-background border border-border rounded px-2 py-1 ml-2"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 text-sm ml-1 cursor-pointer truncate" title={item.fullPath}>
                {pendingFileName || fileName}
              </span>
            )}

            {isHovered && (
              <button
                onClick={handleAddClick}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-sm hover:bg-border opacity-0 transition-opacity"
                style={{ opacity: isHovered ? 1 : 0 }}
                title={t("contextMenu.newFile")}
              >
                <Plus size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuPopup>
          <ContextMenuGroups groups={menuGroups} />
        </ContextMenuPopup>
      </ContextMenu>

      {showCreator && renderCreator()}

      {isExpanded && !!childNodes.length && (
        <div>
          {childNodes.map((child) => (
            <TreeNode
              key={child.fullPath}
              item={child}
              level={level + 1}
              onToggleExpand={onToggleExpand}
              onExpand={onExpand}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
              onCreate={onCreate}
              onAdd={onAdd}
              onCopy={onCopy}
              onCut={onCut}
              onPaste={onPaste}
              canPaste={canPaste}
              cutSourcePath={cutSourcePath}
              onReveal={onReveal}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default React.memo(TreeNode);
