import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { RendererPlugin } from "../../core/plugin";

const GitIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={GitBranchIcon} className={className} size={16} strokeWidth={1.5} />
);

const plugin: RendererPlugin = {
  name: "builtin:git",

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
          component: () => import("./git-view"),
        },
      ],
    };
  },
};

export default plugin;
