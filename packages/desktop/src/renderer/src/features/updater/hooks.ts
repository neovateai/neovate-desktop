import { useState, useEffect } from "react";
import { client } from "../../orpc";
import type { UpdaterState } from "../../../../shared/features/updater/types";

export function useUpdaterState(): UpdaterState {
  const [state, setState] = useState<UpdaterState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    let iter: AsyncIterableIterator<UpdaterState> | undefined;
    (async () => {
      try {
        iter = await client.updater.watchState();
        for await (const s of iter) {
          if (cancelled) break;
          setState(s);
        }
      } catch {
        // Stream disconnected or failed — UI stays at last known state
      }
    })();
    return () => {
      cancelled = true;
      iter?.return?.(undefined);
    };
  }, []);

  return state;
}
