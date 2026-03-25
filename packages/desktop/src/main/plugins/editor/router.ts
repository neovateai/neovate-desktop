import { EventPublisher } from "@orpc/server";
import debug from "debug";

import type { EditorEvent } from "../../../shared/plugins/editor/contract";
import type { PluginContext } from "../../core/plugin/types";

import { CodeServerManager, ExtensionBridgeServer } from "./utils";

const log = debug("neovate:editor:router");

// 每个cwd的事件发布器
const projectPublishers = new Map<string, EventPublisher<{ "editor-event": EditorEvent }>>();

export function createEditorRouter(
  orpcServer: PluginContext["orpcServer"],
  codeServer: CodeServerManager,
  extBridge: ExtensionBridgeServer,
) {
  return orpcServer.router({
    start: orpcServer.handler(async () => {
      log("starting code server");
      const d1 = Date.now();
      try {
        const instance = await codeServer.start(extBridge, (p) => {
          log("downloading", {
            percent: p.percent,
            downloadedBytes: p.downloadedBytes,
            totalBytes: p.totalBytes,
          });
          if (p.downloadedBytes === p.totalBytes) {
            log("download complete", { elapsed: Date.now() - d1 });
          }
        });
        log("code server started", { url: instance.url });
        return { success: true, url: instance.url };
      } catch (error) {
        log("failed to start code server", { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
    connect: orpcServer.handler(() => {
      log("waiting for extension bridge ping");
      return new Promise((resolve) => {
        extBridge.register("ping", async () => {
          log("extension bridge connected");
          resolve({});
        });
      });
    }),
    open: orpcServer.handler(async ({ input }) => {
      log("open file", input);
      const {
        cwd = "",
        fullPath: filePath = "",
        line,
        focus,
      } = input as {
        cwd: string;
        fullPath: string;
        line: number;
        focus?: boolean;
      };
      try {
        const res = await extBridge.send(
          { operationType: "editor.open", params: { filePath, line, focus } },
          cwd,
        );
        return res;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
    setTheme: orpcServer.handler(async ({ input }) => {
      log("set theme", input);
      const { cwd = "", theme = "" } = input as { cwd: string; theme: string };
      const res = await extBridge.send(
        { operationType: "editor.theme.set", params: { theme } },
        cwd,
      );
      return res;
    }),
    events: orpcServer.handler(async function* ({ input, signal }) {
      const { cwd } = input as { cwd: string };
      try {
        let publisher = projectPublishers.get(cwd);
        if (!publisher) {
          publisher = new EventPublisher<{ "editor-event": EditorEvent }>();
          projectPublishers.set(cwd, publisher);
        }
        const editorEventWhiteList = [
          /** when click url in editor, {url: string} */
          "link.open",
          /** add to chat cmd, {type: 'file', data: File}, and support more types in future */
          "context.add",
          /** active editor tabs changed, {current: File, tabs: TabFile[]} */
          "tabs.change",
        ] as const;
        for (const e of editorEventWhiteList) {
          extBridge.register(e, async (params, _cwd) => {
            if (cwd !== _cwd) {
              return;
            }
            publisher.publish("editor-event", {
              type: e,
              detail: params as any,
            });
          });
        }
        const cleanup = () => {
          log("cleanup events", { cwd });
          projectPublishers.delete(cwd);
        };
        if (signal) {
          signal.addEventListener("abort", cleanup, { once: true });
        }
        const events = publisher.subscribe("editor-event", { signal });

        try {
          for await (const event of events) {
            yield event;
          }
        } finally {
          cleanup();
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          log("events aborted normally", { cwd });
          return;
        }
        log("editor events error", e);
      }
    }),
  });
}
