import { useState, useEffect } from "react";
import { client } from "../../orpc";
import type { UpdaterState } from "../../../../shared/features/updater/types";

export function useUpdaterState(): UpdaterState {
  const [state, setState] = useState<UpdaterState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    let iter: AsyncIterableIterator<UpdaterState> | undefined;
    (async () => {
      iter = await client.updater.watchState();
      for await (const s of iter) {
        if (cancelled) break;
        setState(s);
      }
    })();
    return () => {
      cancelled = true;
      iter?.return?.(undefined);
    };
  }, []);

  return state;
}
