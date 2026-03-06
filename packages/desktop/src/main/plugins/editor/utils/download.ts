import fs from "node:fs";
import fsp from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { extract } from "tar";
import { CODE_SERVER_DIR, getArtifactUrl, getCodeServerBinaryPath } from "./constants";

export class CodeServerDownloadError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(`Download failed: ${message}`);
    this.name = "CodeServerDownloadError";
  }
}

export interface DownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * Check if code-server is already downloaded
 */
export async function isCodeServerInstalled(): Promise<boolean> {
  const binaryPath = getCodeServerBinaryPath();
  try {
    await fsp.access(binaryPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download and extract code-server binary
 */
export async function downloadCodeServer(onProgress?: ProgressCallback): Promise<void> {
  const url = getArtifactUrl();
  const binaryPath = getCodeServerBinaryPath();
  const tempDir = path.join(CODE_SERVER_DIR, ".tmp");
  const tempFile = path.join(tempDir, "code-server.tar.gz");

  // Ensure directories exist
  await fsp.mkdir(CODE_SERVER_DIR, { recursive: true });
  await fsp.mkdir(tempDir, { recursive: true });

  try {
    // Download the tarball
    await downloadFile(url, tempFile, onProgress);

    // Extract to binary path
    await fsp.mkdir(binaryPath, { recursive: true });
    await extractTarball(tempFile, binaryPath);

    // Cleanup temp file
    await fsp.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    // Cleanup on failure
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(binaryPath, { recursive: true, force: true }).catch(() => {});

    if (error instanceof CodeServerDownloadError) {
      throw error;
    }
    throw new CodeServerDownloadError((error as Error).message, error as Error);
  }
}

/**
 * Download a file with progress tracking
 */
function downloadFile(url: string, destPath: string, onProgress?: ProgressCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(
          new CodeServerDownloadError(`HTTP ${response.statusCode}: ${response.statusMessage}`),
        );
        return;
      }

      const totalBytes = Number.parseInt(response.headers["content-length"] || "0", 10);
      let downloadedBytes = 0;

      response.on("data", (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (onProgress && totalBytes > 0) {
          onProgress({
            percent: Math.round((downloadedBytes / totalBytes) * 100),
            downloadedBytes,
            totalBytes,
          });
        }
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve();
      });
    });

    request.on("error", (error) => {
      file.close();
      fsp.unlink(destPath).catch(() => {});
      reject(new CodeServerDownloadError(error.message, error));
    });

    file.on("error", (error) => {
      file.close();
      fsp.unlink(destPath).catch(() => {});
      reject(new CodeServerDownloadError(error.message, error));
    });
  });
}

/**
 * Extract a .tar.gz file
 */
async function extractTarball(tarballPath: string, destPath: string): Promise<void> {
  const gunzip = createGunzip();
  const source = fs.createReadStream(tarballPath);

  // Extract with strip: 1 to remove the top-level directory
  const extractor = extract({
    cwd: destPath,
    strip: 1,
  });

  await pipeline(source, gunzip, extractor);
}

/**
 * Remove code-server installation
 */
export async function removeCodeServer(): Promise<void> {
  const binaryPath = getCodeServerBinaryPath();
  await fsp.rm(binaryPath, { recursive: true, force: true });
}
