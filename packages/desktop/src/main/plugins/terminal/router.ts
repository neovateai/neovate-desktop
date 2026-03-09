import { eventIterator } from "@orpc/server";
import { z } from "zod";

import type { PluginContext } from "../../core/plugin/types";
import type { PtyManager } from "./pty-manager";

export function createTerminalRouter(
  orpcServer: PluginContext["orpcServer"],
  ptyManager: PtyManager,
) {
  return orpcServer.router({
    spawn: orpcServer.handler(async ({ input }) => {
      const { cwd, cols, rows } = input as {
        cwd?: string;
        cols: number;
        rows: number;
      };
      const sessionId = ptyManager.spawn({ cwd, cols, rows });
      return { sessionId };
    }),

    write: orpcServer.handler(async ({ input }) => {
      const { sessionId, data } = input as {
        sessionId: string;
        data: string;
      };
      ptyManager.write(sessionId, data);
    }),

    resize: orpcServer.handler(async ({ input }) => {
      const { sessionId, cols, rows } = input as {
        sessionId: string;
        cols: number;
        rows: number;
      };
      ptyManager.resize(sessionId, cols, rows);
    }),

    kill: orpcServer.handler(async ({ input }) => {
      const { sessionId } = input as { sessionId: string };
      ptyManager.kill(sessionId);
    }),

    stream: orpcServer.output(eventIterator(z.string())).handler(async function* ({
      input,
      signal,
    }) {
      const { sessionId } = input as { sessionId: string };
      const session = ptyManager.getSession(sessionId);
      if (!session) return;

      // Combine: client disconnect OR natural PTY exit
      const combined = AbortSignal.any(
        [signal, session.exitController.signal].filter((s): s is AbortSignal => s != null),
      );

      try {
        for await (const chunk of session.publisher.subscribe("data", {
          signal: combined,
        })) {
          yield chunk;
        }
      } catch (err) {
        // AbortError from PTY exit or client disconnect — end stream cleanly
        if ((err as Error)?.name !== "AbortError") throw err;
      }
    }),
  });
}
