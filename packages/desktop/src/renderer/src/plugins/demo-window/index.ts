import type { RendererPlugin } from "../../core/plugin";

const plugin: RendererPlugin = {
  name: "plugin-demo-window",

  configContributions() {
    return {
      secondaryTitlebarItems: [
        {
          id: "demo-window.open",
          order: 0,
          component: () => import("./open-demo-window-button"),
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
