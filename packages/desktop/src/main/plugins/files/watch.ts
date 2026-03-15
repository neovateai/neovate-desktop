import type { FSWatcher } from "chokidar";

import { EventPublisher } from "@orpc/server";
import chokidar from "chokidar";
import debug from "debug";

import type { FileWatchEvent } from "../../../shared/plugins/files/contract";

const log = debug("neovate:files:watch");

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

// per-cwd event publisher and watcher instances
const cwdPublishers = new Map<
  string,
  EventPublisher<{
    "file-changed": FileWatchEvent;
  }>
>();

const cwdWatchers = new Map<string, FSWatcher>();

export function watchWorkspace(
  dir: string,
  callbacks: {
    // includes file system change, add, removed etc, and content change with type 'content'
    onFsChange: (
      subType: "add" | "unlink" | "addDir" | "unlinkDir" | "content",
      file?: { fullPath: string },
    ) => void;
  },
) {
  const { onFsChange } = callbacks;
  const pre = cwdPublishers.get(dir);
  if (pre) {
    log("reusing existing publisher", { dir });
    return pre;
  }
  log("creating watcher", { dir });
  const watcher = chokidar.watch(dir, {
    ignored: [
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
    ],
    depth: 5,
    // usePolling: true,
    // interval: 2000,
    followSymlinks: false,
    alwaysStat: false,
    persistent: true,
    ignoreInitial: true, // otherwise will trigger huge amount of events when init
  });
  const publisher = new EventPublisher<{
    "file-changed": FileWatchEvent;
  }>();
  cwdPublishers.set(dir, publisher);
  cwdWatchers.set(dir, watcher);

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
      unwatchWorkspace(dir);
    });
  return publisher;
}

export function getCwdPublisher(cwd: string) {
  if (!cwdPublishers.has(cwd)) {
    log("creating publisher", { cwd });
    cwdPublishers.set(
      cwd,
      new EventPublisher<{
        "file-changed": FileWatchEvent;
      }>(),
    );
  }
  return cwdPublishers.get(cwd)!;
}

export function unwatchWorkspace(dir: string) {
  log("unwatching workspace", { dir });
  const watcher = cwdWatchers.get(dir);
  if (watcher) {
    watcher.close();
    cwdWatchers.delete(dir);
  }

  const publisher = cwdPublishers.get(dir);
  if (publisher) {
    cwdPublishers.delete(dir);
  }
}
