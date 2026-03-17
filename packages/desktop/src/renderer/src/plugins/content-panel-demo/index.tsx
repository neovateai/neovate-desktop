import { SquareLock01Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { RendererPlugin } from "../../core/plugin";

const SingletonIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={SquareLock01Icon} className={className} size={16} strokeWidth={1.5} />
);

const MultiIcon = ({ className }: { className?: string }) => (
  <HugeiconsIcon icon={Copy01Icon} className={className} size={16} strokeWidth={1.5} />
);

const plugin: RendererPlugin = {
  name: "plugin-content-panel-demo",

  configContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "demo-singleton",
          name: "Demo (Singleton)",
          singleton: true,
          icon: SingletonIcon,
          component: () => import("./demo-view"),
        },
        {
          viewType: "demo-multi",
          name: "Demo (Multi)",
          singleton: false,
          icon: MultiIcon,
          component: () => import("./demo-view"),
        },
      ],
    };
  },
};

export default plugin;
