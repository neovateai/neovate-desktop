import { EyeIcon } from "lucide-react";

import type { RendererPlugin } from "../../core/plugin";

const PreviewIcon = ({ className }: { className?: string }) => (
  <EyeIcon className={className} size={16} />
);

let cleanup: (() => void) | null = null;

const plugin: RendererPlugin = {
  name: "demo-mcp-live-preview",

  configViewContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "live-preview",
          name: "Live Preview",
          singleton: true,
          icon: PreviewIcon,
          component: () => import("./preview-view"),
        },
      ],
    };
  },

  activate(ctx) {
    const client = ctx.orpcClient as any;
    const controller = new AbortController();

    (async () => {
      try {
        const stream = await client["demo-mcp-live-preview"].stream(undefined, {
          signal: controller.signal,
        });
        for await (const _chunk of stream) {
          ctx.app.workbench.contentPanel.openView("live-preview");
          break;
        }
      } catch {
        // stream aborted on deactivate — ignore
      }
    })();

    cleanup = () => controller.abort();
  },

  deactivate() {
    cleanup?.();
    cleanup = null;
  },
};

export default plugin;
