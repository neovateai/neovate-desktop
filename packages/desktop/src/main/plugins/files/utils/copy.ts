import debug from "debug";
import fs from "fs";
import path from "path";

import type { FileErrorCode, FileSystemOperation } from "../../../../shared/plugins/files/contract";

const log = debug("neovate:files:copy");

/**
 * Generate a unique target path with "copy" suffix if the target already exists
 */
function generateCopyPath(targetPath: string): string {
  if (!fs.existsSync(targetPath)) {
    return targetPath;
  }

  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  const dir = path.dirname(targetPath);

  let counter = 1;
  let newPath: string;

  // Try "base copy.ext", then "base copy 2.ext", etc.
  while (true) {
    const suffix = counter === 1 ? " copy" : ` copy ${counter}`;
    newPath = path.join(dir, `${base}${suffix}${ext}`);
    if (!fs.existsSync(newPath)) {
      return newPath;
    }
    counter++;
  }
}

/**
 * Copy a file or directory to a new location
 */
export function copyFile(sourcePath: string, targetPath: string): FileSystemOperation {
  log("copyFile", { sourcePath, targetPath });

  if (!sourcePath) {
    return {
      success: false,
      error: "Source path is required",
      errorCode: "path_required" as FileErrorCode,
    };
  }

  if (!targetPath) {
    return {
      success: false,
      error: "Target path is required",
      errorCode: "path_required" as FileErrorCode,
    };
  }

  if (!fs.existsSync(sourcePath)) {
    return {
      success: false,
      error: "Source file does not exist",
      errorCode: "not_found" as FileErrorCode,
    };
  }

  // Prevent copying to a descendant (would cause infinite recursion)
  // Note: copying to itself is allowed - generateCopyPath will handle it
  if (targetPath.startsWith(sourcePath + path.sep)) {
    return {
      success: false,
      error: "Cannot copy to a descendant",
      errorCode: "unknown" as FileErrorCode,
    };
  }

  try {
    const stats = fs.statSync(sourcePath);
    // Generate unique target path if already exists
    const finalTargetPath = generateCopyPath(targetPath);
    const targetDir = path.dirname(finalTargetPath);

    // Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (stats.isDirectory()) {
      // Copy directory recursively
      fs.cpSync(sourcePath, finalTargetPath, { recursive: true });
    } else {
      // Copy file
      fs.copyFileSync(sourcePath, finalTargetPath);
    }

    log("copyFile success", { sourcePath, targetPath: finalTargetPath });
    return { success: true };
  } catch (error) {
    log("copyFile failed", { sourcePath, targetPath, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      errorCode: "unknown" as FileErrorCode,
    };
  }
}

/**
 * Move a file or directory to a new location
 */
export function moveFile(sourcePath: string, targetPath: string): FileSystemOperation {
  log("moveFile", { sourcePath, targetPath });

  if (!sourcePath) {
    return {
      success: false,
      error: "Source path is required",
      errorCode: "path_required" as FileErrorCode,
    };
  }

  if (!targetPath) {
    return {
      success: false,
      error: "Target path is required",
      errorCode: "path_required" as FileErrorCode,
    };
  }

  if (!fs.existsSync(sourcePath)) {
    return {
      success: false,
      error: "Source file does not exist",
      errorCode: "not_found" as FileErrorCode,
    };
  }

  if (fs.existsSync(targetPath)) {
    return {
      success: false,
      error: "Target file already exists",
      errorCode: "already_exists" as FileErrorCode,
    };
  }

  // Prevent moving to itself or to a descendant
  if (targetPath.startsWith(sourcePath + path.sep) || targetPath === sourcePath) {
    return {
      success: false,
      error: "Cannot move to itself or to a descendant",
      errorCode: "unknown" as FileErrorCode,
    };
  }

  try {
    const stats = fs.statSync(sourcePath);
    const targetDir = path.dirname(targetPath);

    // Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Move file or directory
    try {
      fs.renameSync(sourcePath, targetPath);
    } catch (renameError: unknown) {
      // Cross-device move: fallback to copy + delete
      if (renameError instanceof Error && (renameError as NodeJS.ErrnoException).code === "EXDEV") {
        log("moveFile: cross-device move, using copy+delete fallback");
        if (stats.isDirectory()) {
          fs.cpSync(sourcePath, targetPath, { recursive: true });
        } else {
          fs.copyFileSync(sourcePath, targetPath);
        }
        fs.rmSync(sourcePath, { recursive: true });
      } else {
        throw renameError;
      }
    }

    log("moveFile success", { sourcePath, targetPath });
    return { success: true };
  } catch (error) {
    log("moveFile failed", { sourcePath, targetPath, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      errorCode: "unknown" as FileErrorCode,
    };
  }
}
