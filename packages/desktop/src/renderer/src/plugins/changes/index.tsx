import { FileSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererPlugin } from "../../core/plugin";

import { layoutStore } from "../../components/app-layout/store";

const ChangesIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={FileSearchIcon} className={className} size={16} strokeWidth={1.5} />
);

let cleanupListener: (() => void) | null = null;

const NAME = "plugin-changes";

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
          viewType: "changes",
          name: { "en-US": "Changes", "zh-CN": "变更" },
          singleton: true,
          deactivation: "offscreen",
          icon: ChangesIcon,
          component: () => import("./changes-view"),
        },
      ],
    };
  },

  activate(ctx) {
    const handler = () => {
      const { panels } = layoutStore.getState();
      if (panels.contentPanel?.collapsed) {
        layoutStore.getState().togglePanel("contentPanel");
      }
      ctx.app.workbench.contentPanel.openView("changes");
    };
    window.addEventListener("neovate:open-changes", handler);
    cleanupListener = () => window.removeEventListener("neovate:open-changes", handler);
  },

  deactivate() {
    cleanupListener?.();
    cleanupListener = null;
  },
};

export default plugin;
