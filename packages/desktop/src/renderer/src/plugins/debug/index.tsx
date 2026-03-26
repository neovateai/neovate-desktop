import { Bug01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererPlugin } from "../../core/plugin";

import { useConfigStore } from "../../features/config/store";

const DebugIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={Bug01Icon} className={className} size={16} strokeWidth={1.5} />
);

const plugin: RendererPlugin = {
  name: "plugin-debug",

  configViewContributions() {
    const { developerMode } = useConfigStore.getState();
    if (!developerMode) return {};

    return {
      activityBarItems: [
        {
          id: "debug",
          icon: DebugIcon,
          tooltip: "Developer Mode",
          order: 90,
          action: { type: "secondarySidebarView", viewId: "debug" },
        },
      ],
      secondarySidebarViews: [
        {
          id: "debug",
          title: "Developer Mode",
          deactivation: "offscreen",
          component: () => import("./debug-view"),
        },
      ],
    };
  },
};

export default plugin;
