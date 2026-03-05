import type { PluginContext } from "../../core/plugin/types";
import type { FileWatchEvent } from "../../../shared/plugins/files/contract";
import { EventPublisher } from "@orpc/server";
import fs from "fs";
import path from "path";
import { getFileTree } from "./tree";

export const filesPublisher = new EventPublisher<{
  "file-changed": FileWatchEvent;
}>();

// Simulate periodic events for testing the push channel
let mockInterval: ReturnType<typeof setInterval> | undefined;

export function startMockFileEvents(cwd: string) {
  stopMockFileEvents();
  const types: FileWatchEvent["type"][] = ["create", "update", "delete"];
  let tick = 0;
  mockInterval = setInterval(() => {
    filesPublisher.publish("file-changed", {
      type: types[tick % types.length],
      path: `${cwd}/mock-file-${tick}.txt`,
      timestamp: Date.now(),
    });
    tick++;
  }, 3000);
}

export function stopMockFileEvents() {
  if (mockInterval) {
    clearInterval(mockInterval);
    mockInterval = undefined;
  }
}

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
      startMockFileEvents(cwd);
      for await (const event of filesPublisher.subscribe("file-changed", { signal })) {
        yield event;
      }
    }),
  });
}
