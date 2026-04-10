import debug from "debug";

import type { PluginContext } from "../../core/plugin/types";
import type { BrowserViewManager } from "./browser-view-manager";

const log = debug("neovate:browser:router");

export function createBrowserRouter(
  orpcServer: PluginContext["orpcServer"],
  manager: BrowserViewManager,
) {
  return orpcServer.router({
    create: orpcServer.handler(async ({ input }) => {
      const { viewId, url, bounds } = input as {
        viewId: string;
        url?: string;
        bounds: { x: number; y: number; width: number; height: number };
      };
      log("create: %s url=%s", viewId, url);
      const success = manager.create(viewId, url, bounds);
      return { success };
    }),

    destroy: orpcServer.handler(async ({ input }) => {
      const { viewId } = input as { viewId: string };
      log("destroy: %s", viewId);
      manager.destroy(viewId);
    }),

    navigate: orpcServer.handler(async ({ input }) => {
      const { viewId, url } = input as { viewId: string; url: string };
      log("navigate: %s -> %s", viewId, url);
      manager.navigate(viewId, url);
    }),

    goBack: orpcServer.handler(async ({ input }) => {
      const { viewId } = input as { viewId: string };
      manager.goBack(viewId);
    }),

    goForward: orpcServer.handler(async ({ input }) => {
      const { viewId } = input as { viewId: string };
      manager.goForward(viewId);
    }),

    reload: orpcServer.handler(async ({ input }) => {
      const { viewId } = input as { viewId: string };
      manager.reload(viewId);
    }),

    openDevTools: orpcServer.handler(async ({ input }) => {
      const { viewId } = input as { viewId: string };
      manager.openDevTools(viewId);
    }),

    executeJS: orpcServer.handler(async ({ input }) => {
      const { viewId, code } = input as { viewId: string; code: string };
      return manager.executeJS(viewId, code);
    }),

    setBounds: orpcServer.handler(async ({ input }) => {
      const { viewId, bounds } = input as {
        viewId: string;
        bounds: { x: number; y: number; width: number; height: number };
      };
      manager.setBounds(viewId, bounds);
    }),

    setVisible: orpcServer.handler(async ({ input }) => {
      const { viewId, visible } = input as { viewId: string; visible: boolean };
      manager.setVisible(viewId, visible);
    }),

    events: orpcServer.handler(async function* ({ input, signal }) {
      const { viewId } = input as { viewId: string };
      const publisher = manager.getPublisher(viewId);
      if (!publisher) {
        log("events: no publisher for %s", viewId);
        return;
      }
      try {
        const events = publisher.subscribe("browser-event", { signal });
        for await (const event of events) {
          yield event;
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          log("events aborted: %s", viewId);
          return;
        }
        log("events error: %s %O", viewId, e);
      }
    }),
  });
}
