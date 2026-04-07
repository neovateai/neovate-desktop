import { Activity01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererPlugin } from "../../core/plugin";

import { useConfigStore } from "../../features/config/store";

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
          // TODO: plugin should not import store directly; needs a plugin API for reading config
          discoverable: () => useConfigStore.getState().developerMode,
          component: () => import("./network-view"),
        },
      ],
    };
  },
};

export default plugin;
