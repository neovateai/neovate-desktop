import { FileEditIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { RendererPlugin } from "../../core/plugin";

const EditorIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={FileEditIcon} className={className} size={16} strokeWidth={1.5} />
);

const plugin: RendererPlugin = {
  name: "builtin:editor",

  configContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "editor",
          name: "Editor",
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
