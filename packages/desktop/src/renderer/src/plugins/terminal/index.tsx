import { ComputerTerminal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererPlugin } from "../../core/plugin";

const TerminalIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={ComputerTerminal01Icon} className={className} size={16} strokeWidth={1.5} />
);

const NAME = "plugin-terminal";

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

  configViewContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "terminal",
          name: { "en-US": "Terminal", "zh-CN": "终端" },
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
