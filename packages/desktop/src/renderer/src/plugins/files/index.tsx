import { FolderIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererPlugin } from "../../core/plugin";

const FilesIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={FolderIcon} className={className} size={16} strokeWidth={1.8} />
);

const plugin: RendererPlugin = {
  name: "plugin-files",

  configI18n() {
    return {
      namespace: "plugin-files",
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
          id: "files",
          icon: FilesIcon,
          tooltip: "Files",
          order: 10,
          action: { type: "secondarySidebarView", viewId: "files" },
        },
      ],
      secondarySidebarViews: [
        {
          id: "files",
          title: "Files",
          deactivation: "offscreen",
          component: () => import("./files-view"),
        },
      ],
    };
  },
};

export default plugin;
