import { FileSearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererPlugin } from "../../core/plugin";

import { layoutStore } from "../../components/app-layout/store";

const ReviewIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={FileSearchIcon} className={className} size={16} strokeWidth={1.5} />
);

let cleanupListener: (() => void) | null = null;

const NAME = "plugin-review";

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

  configContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "review",
          name: { "en-US": "Review", "zh-CN": "差异" },
          singleton: true,
          deactivation: "offscreen",
          icon: ReviewIcon,
          component: () => import("./review-view"),
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
      ctx.app.workbench.contentPanel.openView("review");
    };
    window.addEventListener("neovate:open-review", handler);
    cleanupListener = () => window.removeEventListener("neovate:open-review", handler);
  },

  deactivate() {
    cleanupListener?.();
    cleanupListener = null;
  },
};

export default plugin;
