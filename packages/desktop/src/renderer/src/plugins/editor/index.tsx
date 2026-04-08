import { FileEditIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ContractRouterClient } from "@orpc/contract";
import debug from "debug";

import type { RendererPlugin } from "../../core/plugin";
import type { PluginContext } from "../../core/plugin/types";

import { editorContract } from "../../../../shared/plugins/editor/contract";

const log = debug("neovate:editor");

const TEXT_FILE_EXTENSIONS = new Set([
  // JavaScript/TypeScript
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  // Web
  ".html",
  ".css",
  ".scss",
  ".less",
  ".vue",
  ".svelte",
  ".astro",
  // Data
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".csv",
  // Systems
  ".rs",
  ".go",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".java",
  ".kt",
  ".swift",
  // Scripting
  ".py",
  ".rb",
  ".lua",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  // Docs
  ".md",
  ".mdx",
  ".txt",
  ".log",
  ".rst",
  // Config
  ".env",
  ".gitignore",
  ".dockerignore",
  ".editorconfig",
  // SQL/Query
  ".sql",
  ".graphql",
  ".gql",
  // Other
  ".vim",
  ".svg",
  ".dockerfile",
]);

const EditorIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={FileEditIcon} className={className} size={16} strokeWidth={1.5} />
);

const NAME = "plugin-editor";

const plugin: RendererPlugin = {
  name: NAME,

  configI18n() {
    return {
      namespace: NAME,
      loader: async (locale) => {
        try {
          return (await import(`./locales/${locale}.json`)).default;
        } catch {
          return (await import("./locales/en-US.json")).default;
        }
      },
    };
  },

  activate(ctx) {
    log("activating editor plugin");
    const client = ctx.orpcClient as ContractRouterClient<{
      editor: typeof editorContract;
    }>;
    client.editor.start();
  },

  configViewContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "editor",
          name: { "en-US": "Editor", "zh-CN": "编辑器" },
          singleton: true,
          discoverable: false,
          deactivation: "offscreen",
          icon: EditorIcon,
          component: () => import("./editor-view"),
        },
      ],
    };
  },

  configContributions(ctx: PluginContext) {
    return {
      externalUriOpeners: [
        {
          id: "editor.file",
          opener: {
            async canOpenExternalUri(uri: URL) {
              const filename = uri.pathname.split("/").pop() ?? "";
              const dotIdx = filename.lastIndexOf(".");
              if (dotIdx === -1) return false;
              return TEXT_FILE_EXTENSIONS.has(filename.slice(dotIdx));
            },
            async openExternalUri(resolvedUri: URL) {
              const fullPath = decodeURIComponent(resolvedUri.pathname);
              const rawLine = resolvedUri.hash
                ? Number.parseInt(resolvedUri.hash.slice(1), 10)
                : undefined;
              const line = rawLine && !Number.isNaN(rawLine) ? rawLine : 1;
              ctx.app.workbench.contentPanel.openView("editor");
              // @ts-ignore pendingEditorRequest is a global bridge to editor-view
              window.pendingEditorRequest = { fullPath, line };
              window.dispatchEvent(
                new CustomEvent("neovate:open-editor", {
                  detail: { fullPath, line },
                }),
              );
              return true;
            },
          },
          metadata: {
            schemes: ["file"],
            label: "Open in editor",
          },
        },
      ],
    };
  },
};

export default plugin;
