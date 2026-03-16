import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererPlugin } from "../../core/plugin";

const GitIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={GitBranchIcon} className={className} size={16} strokeWidth={1.8} />
);

const plugin: RendererPlugin = {
  name: "plugin-git",

  configI18n() {
    return {
      namespace: "plugin-git",
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
          id: "git",
          icon: GitIcon,
          tooltip: "Source Control",
          order: 20,
          action: { type: "secondarySidebarView", viewId: "git" },
        },
      ],
      secondarySidebarViews: [
        {
          id: "git",
          title: "Source Control",
          deactivation: "offscreen",
          component: () => import("./git-view"),
        },
      ],
      contentPanelViews: [
        {
          viewType: "git-diff",
          name: "Git Diff",
          singleton: true,
          deactivation: "offscreen",
          icon: GitIcon,
          component: () => import("./git-diff-view"),
        },
      ],
    };
  },
};

export default plugin;
