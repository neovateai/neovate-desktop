import { ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { RendererPlugin } from "../../core/plugin";

const TerminalIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={ComputerTerminal01Icon} className={className} size={16} strokeWidth={1.5} />
);

const plugin: RendererPlugin = {
  name: "builtin:terminal",

  configContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "terminal",
          name: "Terminal",
          singleton: false,
          deactivation: "offscreen",
          icon: TerminalIcon,
          component: () => import("./terminal-view"),
        },
      ],
    };
  },
};

export default plugin;
