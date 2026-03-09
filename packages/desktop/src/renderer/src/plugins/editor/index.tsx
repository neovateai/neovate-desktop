import { FileEditIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ContractRouterClient } from "@orpc/contract";

import type { RendererPlugin } from "../../core/plugin";

import { editorContract } from "../../../../shared/plugins/editor/contract";

const EditorIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={FileEditIcon} className={className} size={16} strokeWidth={1.5} />
);

const plugin: RendererPlugin = {
  name: "builtin:editor",
  activate(ctx) {
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
          name: "Editor",
          singleton: true,
          deactivation: "unmount",
          icon: EditorIcon,
          component: () => import("./editor-view"),
        },
      ],
    };
  },
};

export default plugin;
