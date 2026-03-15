import debug from "debug";
import { useState, useEffect } from "react";

import type { UpdaterState } from "../../../../shared/features/updater/types";

import { client } from "../../orpc";

const log = debug("neovate:updater");

export function useUpdaterState(): UpdaterState {
  const [state, setState] = useState<UpdaterState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    let iter: AsyncIterableIterator<UpdaterState> | undefined;
    (async () => {
      try {
        log("subscribing to updater state");
        iter = await client.updater.subscribe();
        for await (const s of iter) {
          if (cancelled) break;
          log("state update", { status: s.status });
          setState(s);
        }
      } catch {
        // Stream disconnected or failed — UI stays at last known state
        log("subscription stream ended");
      }
    })();
    return () => {
      cancelled = true;
      iter?.return?.(undefined);
    };
  }, []);

  return state;
}
