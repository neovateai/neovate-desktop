import type { RendererPlugin } from "../../core/plugin";

const NS = "plugin-demo-window";

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

  configContributions() {
    return {
      secondaryTitlebarItems: [
        {
          id: "demo-window.open",
          tooltip: `%${NS}:demoWindow.open%`,
          order: 0,
          component: () => import("./open-demo-window-button"),
        },
        {
          id: "demo-window.chat",
          tooltip: `%${NS}:demoWindow.chat%`,
          order: 1,
          component: () => import("./demo-button-a"),
        },
        {
          id: "demo-window.settings",
          tooltip: `%${NS}:demoWindow.settings%`,
          order: 2,
          component: () => import("./demo-button-b"),
        },
      ],
    };
  },

  configWindowContributions() {
    return [
      {
        windowType: "demo",
        component: () => import("./demo-window"),
      },
    ];
  },
};

export default plugin;
