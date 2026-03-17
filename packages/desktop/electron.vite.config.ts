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
      // TODO: fix this
      externalizeDeps: {
        exclude: ["acpx", "electron-store", "get-port"],
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
