import { Activity01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererPlugin } from "../../core/plugin";

const NetworkIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={Activity01Icon} className={className} size={16} strokeWidth={1.5} />
);

const plugin: RendererPlugin = {
  name: "plugin-network",

  configViewContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "network",
          name: "Network",
          singleton: true,
          icon: NetworkIcon,
          component: () => import("./network-view"),
        },
      ],
    };
  },
};

export default plugin;
