import type { FSWatcher } from "chokidar";

import { EventPublisher } from "@orpc/server";
import chokidar from "chokidar";

import type { FileWatchEvent } from "../../../shared/plugins/files/contract";

// 防抖函数
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

// 为每个 cwd 创建独立的事件发布器和watcher
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
    // includes file system change, add, removed etc, not include file content change
    onFsChange: (subType: "add" | "unlink" | "addDir" | "unlinkDir") => void;
  },
) {
  const { onFsChange } = callbacks;
  const pre = cwdPublishers.get(dir);
  if (pre) {
    return pre;
  }
  const watcher = chokidar.watch(dir, {
    ignored: [
      /(^|[\\])\../, // 隐藏文件
      /node_modules/,
      "**/package-lock.json",
      "**/yarn.lock",
      "**/dist/**",
      "**/build/**",
      "**/out/**",
      "**/.git/**",
      "**/.DS_Store",
      "**/.cache/**",
      "**/coverage/**",
      /.*\.(jpg|jpeg|png|gif|svg|mp4|mp3)$/i, // 媒体文件
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

  const debouncedOnFsChange = debounce(onFsChange, 300);

  watcher
    .on("add", (e) => {
      console.log("add", e);
      debouncedOnFsChange("add");
    })
    .on("unlink", () => {
      debouncedOnFsChange("unlink");
    })
    .on("addDir", () => {
      debouncedOnFsChange("addDir");
    })
    .on("unlinkDir", () => {
      debouncedOnFsChange("unlinkDir");
    })
    .on("error", (e) => {
      console.log("watcher error", e);
      unwatchWorkspace(dir);
    });
  return publisher;
}

export function getCwdPublisher(cwd: string) {
  if (!cwdPublishers.has(cwd)) {
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
