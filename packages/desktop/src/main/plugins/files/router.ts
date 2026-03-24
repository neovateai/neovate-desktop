import debug from "debug";
import fs from "fs";
import path from "path";

import type { PluginContext } from "../../core/plugin/types";

import { listDirectory } from "./tree";
import { unwatchDirectory, watchDirectory } from "./watch";

const log = debug("neovate:files:router");

export function createFilesRouter(orpcServer: PluginContext["orpcServer"]) {
  return orpcServer.router({
    tree: orpcServer.handler(async ({ input }) => {
      const { cwd, root } = input as { cwd: string; root?: string };
      log("tree requested", { cwd, root });
      try {
        if (!cwd) {
          throw new Error("Invalid path");
        }
        const tree = await listDirectory(cwd, root);
        return { tree };
      } catch (error) {
        return {
          tree: [],
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    delete: orpcServer.handler(async ({ input }) => {
      const data = input as { path: string };
      log("delete requested", { path: data?.path });
      try {
        const { path: filePath } = data || {};
        if (!filePath) {
          return { success: false, error: "Path is required" };
        }
        if (!fs.existsSync(filePath)) {
          return { success: false, error: "File does not exist" };
        }
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
        log("deleted", { path: filePath });
        return { success: true, data: {} };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    rename: orpcServer.handler(async ({ input }) => {
      const data = input as { oldPath: string; newPath: string };
      log("rename requested", input);
      try {
        const { oldPath, newPath } = data || {};
        if (!oldPath || !newPath) {
          return {
            success: false,
            error: "Both oldPath and newPath are required",
          };
        }
        if (!fs.existsSync(oldPath)) {
          return { success: false, error: "Source file does not exist" };
        }
        if (fs.existsSync(newPath)) {
          return { success: false, error: "Target file already exists" };
        }
        const newDir = path.dirname(newPath);
        if (!fs.existsSync(newDir)) {
          fs.mkdirSync(newDir, { recursive: true });
        }
        fs.renameSync(oldPath, newPath);
        log("renamed", { oldPath, newPath });
        return { success: true, data: {} };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    watch: orpcServer.handler(async function* ({ input, signal }) {
      const { cwd } = input as { cwd: string };
      log("watch requested", { cwd });

      try {
        const publisher = watchDirectory(cwd, {
          onFsChange: (subType, file) => {
            publisher.publish("file-changed", {
              timestamp: Date.now(),
              path: file?.fullPath || "",
              type: subType,
            });
          },
        });

        const cleanup = () => {
          log("unwatch", { cwd });
          unwatchDirectory(cwd);
        };
        if (signal) {
          signal.addEventListener("abort", cleanup, { once: true });
        }
        const events = publisher.subscribe("file-changed", { signal });

        try {
          for await (const event of events) {
            yield event;
          }
        } finally {
          cleanup();
        }
      } catch (e) {
        // 忽略 AbortError，这是正常的中断
        if (e instanceof Error && e.name === "AbortError") {
          log("watch aborted normally", { cwd });
          return;
        }
        log("file watch error", e);
      }
    }),
  });
}
