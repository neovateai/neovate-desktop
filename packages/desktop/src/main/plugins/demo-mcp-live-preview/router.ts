import { eventIterator } from "@orpc/server";
import { z } from "zod";

import type { PluginContext } from "../../core/plugin/types";
import type { PreviewManager } from "./preview-manager";

export function createLivePreviewRouter(
  orpcServer: PluginContext["orpcServer"],
  previewManager: PreviewManager,
) {
  return orpcServer.router({
    getPreview: orpcServer.handler(async () => {
      return { html: previewManager.getHtml() };
    }),

    stream: orpcServer.output(eventIterator(z.string())).handler(async function* ({ signal }) {
      const current = previewManager.getHtml();
      if (current) yield current;

      try {
        for await (const html of previewManager.publisher.subscribe("update", { signal })) {
          yield html;
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") throw err;
      }
    }),
  });
}
