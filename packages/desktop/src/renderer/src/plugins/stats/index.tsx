import { ChartColumnBigIcon } from "lucide-react";

import type { RendererPlugin } from "../../core/plugin";

const StatsIcon = ({ className }: { className?: string }) => (
  <ChartColumnBigIcon className={className} size={16} strokeWidth={1.5} />
);

const plugin: RendererPlugin = {
  name: "plugin-stats",

  configViewContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "stats",
          name: "Token Stats",
          singleton: true,
          icon: StatsIcon,
          component: () => import("./stats-view"),
        },
      ],
    };
  },
};

export default plugin;
