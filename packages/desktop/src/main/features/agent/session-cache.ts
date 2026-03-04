import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import debug from "debug";
import type { CachedSession } from "../../../shared/features/agent/types";

const log = debug("neovate:session-cache");

const CACHE_DIR = path.join(os.homedir(), ".neovate-desktop", "session-cache");

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    log("ensureCacheDir: created %s", CACHE_DIR);
  }
}

function cachePath(sessionId: string): string {
  return path.join(CACHE_DIR, `${sessionId}.json`);
}

export function saveSessionCache(sessionId: string, data: CachedSession): void {
  const t0 = performance.now();
  try {
    ensureCacheDir();
    const filePath = cachePath(sessionId);
    fs.writeFileSync(filePath, JSON.stringify(data), "utf-8");
    log(
      "saveSessionCache: DONE sessionId=%s msgs=%d in %dms",
      sessionId.slice(0, 8),
      data.messages.length,
      Math.round(performance.now() - t0),
    );
  } catch (error) {
    log(
      "saveSessionCache: ERROR sessionId=%s error=%s",
      sessionId.slice(0, 8),
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function loadSessionCache(sessionId: string): CachedSession | null {
  const t0 = performance.now();
  const filePath = cachePath(sessionId);
  try {
    if (!fs.existsSync(filePath)) {
      log("loadSessionCache: MISS sessionId=%s", sessionId.slice(0, 8));
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as CachedSession;
    log(
      "loadSessionCache: HIT sessionId=%s msgs=%d in %dms",
      sessionId.slice(0, 8),
      data.messages.length,
      Math.round(performance.now() - t0),
    );
    return data;
  } catch (error) {
    log(
      "loadSessionCache: ERROR sessionId=%s error=%s",
      sessionId.slice(0, 8),
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
