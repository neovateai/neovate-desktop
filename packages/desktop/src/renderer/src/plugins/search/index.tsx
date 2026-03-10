import { Search02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererPlugin } from "../../core/plugin";

const SearchIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={Search02Icon} className={className} size={16} strokeWidth={1.5} />
);

const plugin: RendererPlugin = {
  name: "plugin-search",

  configI18n() {
    return {
      namespace: "plugin-search",
      loader: async (locale) => {
        try {
          return (await import(`./locales/${locale}.json`)).default;
        } catch {
          return (await import("./locales/en-US.json")).default;
        }
      },
    };
  },

  configContributions() {
    return {
      activityBarItems: [
        {
          id: "search",
          icon: SearchIcon,
          tooltip: "Search",
          order: 20,
          action: { type: "secondarySidebarView", viewId: "search" },
        },
      ],
      secondarySidebarViews: [
        {
          id: "search",
          title: "Search",
          component: () => import("./search-view"),
        },
      ],
    };
  },
};

export default plugin;
