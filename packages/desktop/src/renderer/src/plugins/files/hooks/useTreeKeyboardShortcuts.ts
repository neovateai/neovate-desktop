import { useEffect } from "react";

import { FileNodeItem } from "./useFileData";

interface ClipboardItem {
  sourcePath: string;
  operation: "copy" | "cut";
}

interface UseTreeKeyboardShortcutsOptions {
  cwd: string;
  selectedKeys: Set<string>;
  renamingKey: string;
  nodes: FileNodeItem[];
  clipboardItem: ClipboardItem | null;
  onRenameStart?: (key: string) => void;
  onCopy: (item: FileNodeItem) => void;
  onCut: (item: FileNodeItem) => void;
  onPaste: (targetDir: string) => void;
}

/**
 * Check if the focus is on an input field that should capture keyboard events
 */
function isInputFocused(): boolean {
  const target = document.activeElement as HTMLElement;
  if (!target) return false;

  const tagName = target.tagName;
  // Check for standard input elements
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  // Check for contentEditable elements
  if (target.isContentEditable || target.closest("[contenteditable='true']")) {
    return true;
  }
  // Check if focus is inside a dialog, modal, or popover
  if (target.closest("[role='dialog'], [role='alertdialog'], [data-state='open']")) {
    return true;
  }
  return false;
}

/**
 * Get the target directory for paste operation
 * If a file is selected, use its parent directory
 * If a folder is selected, use the folder itself
 */
function getTargetDirForPaste(item: FileNodeItem): string {
  return item.isFolder ? item.fullPath : item.fullPath.substring(0, item.fullPath.lastIndexOf("/"));
}

/**
 * Hook for handling keyboard shortcuts in the file tree
 * Supports: Enter (rename), Cmd/Ctrl+C (copy), Cmd/Ctrl+X (cut), Cmd/Ctrl+V (paste), Delete/Backspace (delete)
 */
export function useTreeKeyboardShortcuts(options: UseTreeKeyboardShortcutsOptions) {
  const {
    cwd,
    selectedKeys,
    renamingKey,
    nodes,
    clipboardItem,
    onRenameStart,
    onCopy,
    onCut,
    onPaste,
  } = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input field
      if (isInputFocused()) return;

      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const isModKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + V: paste (can work even without selection - pastes to root)
      if (e.key === "v" && isModKey && clipboardItem && !renamingKey) {
        e.preventDefault();

        // If no selection/ multiple selections, paste to root (cwd)
        if (selectedKeys.size === 0 || selectedKeys.size > 1) {
          onPaste(cwd);
          return;
        }

        // Single selection - determine target directory
        const selectedPath = [...selectedKeys][0];
        const item = nodes.find((i) => i.fullPath === selectedPath);

        // If item not found or is root, paste to cwd
        if (!item || item.relPath === "") {
          onPaste(cwd);
          return;
        }

        const targetDir = getTargetDirForPaste(item);
        onPaste(targetDir);
        return;
      }

      // Must have exactly one item selected for other operations (rename, copy, cut)
      if (selectedKeys.size !== 1) return;

      const selectedPath = [...selectedKeys][0];
      const item = nodes.find((i) => i.fullPath === selectedPath);

      // Skip root item (empty relPath) and if item not found
      if (!item || item.relPath === "") return;

      if (renamingKey) {
        return;
      }

      // Enter key: start rename mode
      if (e.key === "Enter") {
        e.preventDefault();
        onRenameStart?.(selectedPath);
        return;
      }

      // Cmd/Ctrl + C: copy
      if (e.key === "c" && isModKey) {
        e.preventDefault();
        onCopy(item);
        return;
      }

      // Cmd/Ctrl + X: cut
      if (e.key === "x" && isModKey) {
        e.preventDefault();
        onCut(item);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cwd, selectedKeys, renamingKey, nodes, clipboardItem, onCopy, onCut, onPaste]);
}
