import type { RendererPlugin } from "../../core/plugin";

const plugin: RendererPlugin = {
  name: "plugin-demo-window",

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
