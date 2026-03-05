import { FolderIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { RendererPlugin } from "../../core/plugin";

const FilesIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={FolderIcon} className={className} size={16} strokeWidth={1.5} />
);

const plugin: RendererPlugin = {
  name: "builtin:files",

  activate(ctx) {
    ctx.app.i18nManager.setupLazyNamespaces([
      {
        namespace: "plugin-files",
        loader: (locale) => import(`./locales/${locale}.json`),
      },
    ]);
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
          component: () => import("./files-view"),
        },
      ],
    };
  },
};

export default plugin;
