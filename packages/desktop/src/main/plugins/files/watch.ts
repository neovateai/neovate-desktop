import type { FSWatcher } from "chokidar";

import { EventPublisher } from "@orpc/server";
import chokidar from "chokidar";
import debug from "debug";

import type { FileWatchEvent } from "../../../shared/plugins/files/contract";

const log = debug("neovate:files:watch");

const MAX_WATCHED_DIRS = 100;

const IGNORED_PATTERNS = [
  /(^|[\\])\../, // hidden files
  /node_modules/,
  "**/package-lock.json",
  "**/yarn.lock",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  /(^|[/\\])\.git([/\\]|$)/,
  "**/.DS_Store",
  "**/.cache/**",
  "**/coverage/**",
  /.*\.(jpg|jpeg|png|gif|svg|mp4|mp3)$/i, // media files
  /\.node\//, // .node directories (native bindings)
];

// per-directory watcher and publisher instances
const dirPublishers = new Map<
  string,
  EventPublisher<{
    "file-changed": FileWatchEvent;
  }>
>();

const dirWatchers = new Map<string, FSWatcher>();

// debounce utility
function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
}

export function watchDirectory(
  dir: string,
  callbacks: {
    onFsChange: (
      subType: "add" | "unlink" | "addDir" | "unlinkDir" | "content",
      file?: { fullPath: string },
    ) => void;
  },
) {
  const { onFsChange } = callbacks;
  const existing = dirPublishers.get(dir);
  if (existing) {
    log("reusing existing publisher", { dir });
    return existing;
  }

  if (dirWatchers.size >= MAX_WATCHED_DIRS) {
    log("MAX_WATCHED_DIRS reached, refusing new watch", { dir, current: dirWatchers.size });
    const publisher = new EventPublisher<{ "file-changed": FileWatchEvent }>();
    // Yield truncation sentinel so the renderer knows to stop
    publisher.publish("file-changed", {
      timestamp: Date.now(),
      path: dir,
      type: "add", // will be filtered by renderer via a separate mechanism
    });
    return publisher;
  }

  log("creating watcher", { dir, depth: 0 });
  const watcher = chokidar.watch(dir, {
    ignored: IGNORED_PATTERNS,
    depth: 0,
    followSymlinks: false,
    alwaysStat: false,
    persistent: true,
    ignoreInitial: true,
  });
  const publisher = new EventPublisher<{
    "file-changed": FileWatchEvent;
  }>();
  dirPublishers.set(dir, publisher);
  dirWatchers.set(dir, watcher);

  const _onFsChange = debounce(onFsChange, 300);

  watcher
    .on("add", (e) => {
      log("file added", { path: e });
      _onFsChange("add");
    })
    .on("unlink", (e) => {
      log("file removed", { path: e });
      _onFsChange("unlink");
    })
    .on("addDir", (e) => {
      log("dir added", { path: e });
      _onFsChange("addDir");
    })
    .on("unlinkDir", (e) => {
      log("dir removed", { path: e });
      _onFsChange("unlinkDir");
    })
    .on("change", (fullPath) => {
      log("file changed", { path: fullPath });
      _onFsChange("content", { fullPath });
    })
    .on("error", (e) => {
      log("watcher error", { dir, error: e });
      unwatchDirectory(dir);
    });
  return publisher;
}

export function getCwdPublisher(cwd: string) {
  if (!dirPublishers.has(cwd)) {
    log("creating publisher", { cwd });
    dirPublishers.set(
      cwd,
      new EventPublisher<{
        "file-changed": FileWatchEvent;
      }>(),
    );
  }
  return dirPublishers.get(cwd)!;
}

export function unwatchDirectory(dir: string) {
  log("unwatching directory", { dir });
  const watcher = dirWatchers.get(dir);
  if (watcher) {
    watcher.close();
    dirWatchers.delete(dir);
  }

  const publisher = dirPublishers.get(dir);
  if (publisher) {
    dirPublishers.delete(dir);
  }
}

export function unwatchAll() {
  log("unwatching all directories", { count: dirWatchers.size });
  for (const dir of [...dirWatchers.keys()]) {
    unwatchDirectory(dir);
  }
}
