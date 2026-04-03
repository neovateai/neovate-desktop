import type { RendererPlugin } from "../../core/plugin";

const NS = "plugin-popup-window";

const plugin: RendererPlugin = {
  name: NS,

  configI18n() {
    return {
      namespace: NS,
      loader: async (locale) => {
        try {
          return (await import(`./locales/${locale}.json`)).default;
        } catch {
          return (await import("./locales/en-US.json")).default;
        }
      },
    };
  },

  configWindowContributions() {
    return [
      {
        windowType: "popup-window",
        component: () => import("./popup-window"),
      },
    ];
  },
};

export default plugin;
