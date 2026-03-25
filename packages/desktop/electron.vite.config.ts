import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const appDefine = {
  __APP_NAME__: JSON.stringify("Neovate"),
  __APP_ID__: JSON.stringify("neovate-desktop"),
};

export default defineConfig({
  main: {
    define: appDefine,
    build: {
      outDir: "dist/main",
      externalizeDeps: {
        // Bundle all pure-JS deps into the main process output.
        // Only node-pty (native), claude-agent-sdk (vendored binaries),
        // and electron-updater (reads app metadata) stay external.
        exclude: [
          "@anthropic-ai/sdk",
          "@electron-toolkit/utils",
          "@orpc/contract",
          "@orpc/server",
          "adm-zip",
          "ai",
          "chokidar",
          "debug",
          "electron-log",
          "electron-store",
          "fuse.js",
          "get-port",
          "minimatch",
          "simple-git",
          "tar",
          "zod",
        ],
      },
    },
  },
  preload: {
    build: {
      outDir: "dist/preload",
      externalizeDeps: {
        exclude: ["@electron-toolkit/preload"],
      },
    },
  },
  renderer: {
    define: appDefine,
    plugins: [react(), tailwindcss()],
    resolve: {
      // Force a single copy of shiki so @pierre/diffs (shiki@3) shares the
      // app's shiki@4 — the APIs are compatible and this eliminates ~6 MB of
      // duplicated language/theme grammar chunks.
      dedupe: ["shiki"],
    },
    build: {
      outDir: "dist/renderer",
      emptyOutDir: true,
      rollupOptions: {
        onLog(level, log, handler) {
          // Suppress warnings from @hugeicons/core-free-icons ESM files containing
          // /*#__PURE__*/ annotations in positions Rollup cannot interpret.
          // These warnings are harmless - Rollup auto-removes the comments.
          // See: https://github.com/rollup/rollup/issues/5324
          if (
            level === "warn" &&
            log.id?.includes("@hugeicons") &&
            log.message?.includes("annotation")
          ) {
            return;
          }
          handler(level, log);
        },
      },
    },
  },
});
