import type { RendererPlugin } from "../../core/plugin";

const plugin: RendererPlugin = {
  name: "builtin:terminal",

  configContributions() {
    return {
      contentPanelViews: [
        {
          id: "terminal",
          name: "Terminal",
          singleton: false,
          component: () => import("./terminal-view"),
        },
      ],
    };
  },
};

export default plugin;
