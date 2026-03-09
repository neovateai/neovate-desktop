import fs from "fs";
import path from "path";

import type { PluginContext } from "../../core/plugin/types";

import { getFileTree } from "./tree";
import { unwatchWorkspace, watchWorkspace } from "./watch";

export function createFilesRouter(orpcServer: PluginContext["orpcServer"]) {
  return orpcServer.router({
    tree: orpcServer.handler(async ({ input }) => {
      const { cwd } = input as { cwd: string };
      try {
        if (!cwd) {
          throw new Error("Invalid path");
        }
        const tree = await getFileTree(cwd);
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

      const publisher = watchWorkspace(cwd, {
        onFsChange: (subType) => {
          publisher.publish("file-changed", {
            timestamp: Date.now(),
            path: "",
            type: subType,
          });
        },
      });
      if (signal) {
        signal.addEventListener("abort", () => {
          console.log("unwatch", cwd);
          unwatchWorkspace(cwd); // 清理监听器watch 和 发布器pub
        });
      }
      const events = publisher.subscribe("file-changed", { signal });
      for await (const event of events) {
        yield event;
      }
    }),
  });
}
