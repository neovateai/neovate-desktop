/**
 * Cross-platform zip extraction helper.
 *
 * Unix: uses `unzip` (available on macOS/Linux).
 * Windows: uses `tar` (bsdtar, ships with Windows 10+).
 */
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

export function extractZip(zipPath: string, outDir: string, innerPath: string): void {
  if (process.platform === "win32") {
    const tmpDir = join(outDir, "_extract");
    mkdirSync(tmpDir, { recursive: true });
    try {
      const proc = Bun.spawnSync(["tar", "-xf", zipPath, "-C", tmpDir]);
      if (proc.exitCode !== 0)
        throw new Error(
          `tar failed: ${proc.stderr.toString().trim() || proc.stdout.toString().trim()}`,
        );
      renameSync(join(tmpDir, innerPath), join(outDir, basename(innerPath)));
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  } else {
    const proc = Bun.spawnSync(["unzip", "-o", "-j", zipPath, innerPath, "-d", outDir]);
    if (proc.exitCode !== 0)
      throw new Error(
        `unzip failed: ${proc.stderr.toString().trim() || proc.stdout.toString().trim()}`,
      );
  }
}
