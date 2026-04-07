import debug from "debug";
import { useEffect } from "react";

import type { SessionLifecycleEvent } from "../../../../../shared/features/agent/types";

import { client } from "../../../orpc";
import { useAgentStore } from "../store";

const log = debug("neovate:session-lifecycle");

/**
 * Subscribes to session lifecycle events (created/deleted) from the main process.
 * Keeps the renderer's agentSessions list in sync when sessions are created or
 * deleted externally (e.g. via Telegram remote control).
 */
export function useSessionLifecycleSubscription(cwd: string) {
  const appendAgentSession = useAgentStore((s) => s.appendAgentSession);
  const removeAgentSession = useAgentStore((s) => s.removeAgentSession);
  const setAgentSessions = useAgentStore((s) => s.setAgentSessions);

  useEffect(() => {
    if (!cwd) return;

    let cancelled = false;
    let iter: AsyncIterableIterator<SessionLifecycleEvent> | undefined;

    (async () => {
      while (!cancelled) {
        try {
          iter = await client.agent.subscribeSessionLifecycle();
          for await (const event of iter) {
            if (cancelled) break;
            log(
              "event: type=%s sessionId=%s source=%s",
              event.type,
              event.session.sessionId,
              event.source,
            );
            if (event.type === "created") {
              appendAgentSession(event.session);
            } else if (event.type === "deleted") {
              removeAgentSession(event.session.sessionId);
            }
          }
        } catch {
          if (cancelled) break;
          // Subscription dropped — reconcile by re-fetching full list
          log("subscription dropped, re-fetching sessions");
          try {
            const sessions = await client.agent.listSessions({ cwd });
            setAgentSessions(sessions);
          } catch {
            // Ignore fetch errors during reconnect
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      iter?.return?.(undefined);
    };
  }, [cwd, appendAgentSession, removeAgentSession, setAgentSessions]);
}
