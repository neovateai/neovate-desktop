import type { PluginContext } from "../../core/plugin/types";
import type { AppContext } from "../../router";

export function createChangesRouter(orpcServer: PluginContext["orpcServer"]) {
  return orpcServer.router({
    lastTurnFiles: orpcServer.handler(async ({ input, context }) => {
      const { sessionId } = input as { sessionId: string };
      const { sessionManager } = context as AppContext;
      return sessionManager.lastTurnFiles(sessionId);
    }),
    lastTurnDiff: orpcServer.handler(async ({ input, context }) => {
      const { sessionId, file } = input as { sessionId: string; file: string };
      const { sessionManager } = context as AppContext;
      return sessionManager.lastTurnDiff(sessionId, file);
    }),
  });
}
