import { FileEditIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ContractRouterClient } from "@orpc/contract";
import debug from "debug";

import type { RendererPlugin } from "../../core/plugin";

import { editorContract } from "../../../../shared/plugins/editor/contract";

const log = debug("neovate:editor");

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
  configContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "editor",
          name: { "en-US": "Editor", "zh-CN": "编辑器" },
          singleton: true,
          deactivation: "offscreen",
          icon: EditorIcon,
          component: () => import("./editor-view"),
        },
      ],
    };
  },
};

export default plugin;
