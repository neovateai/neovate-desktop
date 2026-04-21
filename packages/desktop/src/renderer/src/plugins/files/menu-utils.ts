import type { useFilesTranslation } from "./i18n";
import type { MenuItem } from "./menu-types";

type FilesTranslation = ReturnType<typeof useFilesTranslation>["t"];

interface CreationMenuOptions {
  /** 新建文件的回调 */
  onCreateFile?: () => void;
  /** 新建文件夹的回调 */
  onCreateFolder?: () => void;
  /** 在访达中显示的回调 */
  onReveal?: () => void;
}

/**
 * 构建新建菜单项（新建文件、新建文件夹、在访达中显示）
 */
export function buildCreationMenu(t: FilesTranslation, options: CreationMenuOptions): MenuItem[] {
  const items: MenuItem[] = [];

  if (options.onCreateFile && options.onCreateFolder) {
    items.push({ label: t("contextMenu.newFile"), action: options.onCreateFile });
    items.push({ label: t("contextMenu.newFolder"), action: options.onCreateFolder });
  }

  if (options.onReveal) {
    // TODO: 后续如果要支持Windows，这里的表述要调整，mac 下是访达，windows 下应该是资源管理器
    items.push({ label: t("contextMenu.revealInFinder"), action: options.onReveal });
  }

  return items;
}

interface ClipboardMenuOptions {
  /** 复制的回调 */
  onCopy?: () => void;
  /** 剪切的回调 */
  onCut?: () => void;
  /** 粘贴的回调 */
  onPaste?: () => void;
}

/**
 * 构建剪贴板菜单项（复制、剪切、粘贴）
 */
export function buildClipboardMenu(t: FilesTranslation, options: ClipboardMenuOptions): MenuItem[] {
  const items: MenuItem[] = [];

  if (options.onCopy) {
    items.push({ label: t("contextMenu.copy"), action: options.onCopy });
  }
  if (options.onCut) {
    items.push({ label: t("contextMenu.cut"), action: options.onCut });
  }
  if (options.onPaste) {
    items.push({ label: t("contextMenu.paste"), action: options.onPaste });
  }

  return items;
}

interface PathMenuOptions {
  /** 完整路径 */
  fullPath: string;
  /** 相对路径 */
  relativePath: string;
}

/**
 * 构建路径菜单项（复制完整路径、复制相对路径）
 */
export function buildPathMenu(t: FilesTranslation, options: PathMenuOptions): MenuItem[] {
  return [
    {
      label: t("contextMenu.copyFullPath"),
      action: () => navigator.clipboard.writeText(options.fullPath),
    },
    {
      label: t("contextMenu.copyRelativePath"),
      action: () => navigator.clipboard.writeText(options.relativePath),
    },
  ];
}
