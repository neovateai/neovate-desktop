import { Globe } from "lucide-react";

import type { RendererPlugin } from "../../core/plugin";

const NAME = "plugin-browser";

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
          viewType: "browser",
          name: { "en-US": "Browser", "zh-CN": "浏览器" },
          singleton: false,
          deactivation: "offscreen",
          icon: ({ className }: { className?: string }) => <Globe className={className} />,
          component: () => import("./browser-view"),
        },
      ],
    };
  },
};

export default plugin;
