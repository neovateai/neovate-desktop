import { Globe } from "lucide-react";

import type { RendererPlugin } from "../../core/plugin";
import type { PluginContext } from "../../core/plugin/types";

const NAME = "plugin-browser";

function matchHost(hostname: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === pattern;
}

interface BrowserPluginOptions {
  includeHosts?: string[];
}

export default function browserPlugin(options?: BrowserPluginOptions): RendererPlugin {
  return {
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

    configContributions(ctx: PluginContext) {
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
        externalUriOpeners: options?.includeHosts
          ? [
              {
                id: "browser.preview",
                opener: {
                  async canOpenExternalUri(uri: URL) {
                    return options.includeHosts!.some((pattern) =>
                      matchHost(uri.hostname, pattern),
                    );
                  },
                  async openExternalUri(resolvedUri: URL) {
                    ctx.app.workbench.contentPanel.openView("browser", {
                      state: { url: resolvedUri.toString() },
                    });
                    return true;
                  },
                },
                metadata: {
                  schemes: ["http", "https"],
                  label: "Open in browser preview",
                },
              },
            ]
          : [],
      };
    },
  };
}
