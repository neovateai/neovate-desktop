import debug from "debug";
import { useCallback, useSyncExternalStore } from "react";

export type TurnResult = "success" | "error";

const log = debug("neovate:turn-result");

const results = new Map<string, TurnResult>();
const listeners = new Map<string, Set<() => void>>();

function notify(sessionId: string) {
  const set = listeners.get(sessionId);
  if (set) for (const cb of set) cb();
}

export function markTurnCompleted(sessionId: string, result: TurnResult) {
  log("markTurnCompleted: sid=%s result=%s", sessionId, result);
  results.set(sessionId, result);
  notify(sessionId);
}

export function clearTurnResult(sessionId: string) {
  if (!results.has(sessionId)) return;
  log("clearTurnResult: sid=%s", sessionId);
  results.delete(sessionId);
  notify(sessionId);
}

function subscribe(sessionId: string, cb: () => void): () => void {
  let set = listeners.get(sessionId);
  if (!set) {
    set = new Set();
    listeners.set(sessionId, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(sessionId);
  };
}

export function useUnseenTurnResult(sessionId: string): TurnResult | undefined {
  const sub = useCallback((cb: () => void) => subscribe(sessionId, cb), [sessionId]);
  const snap = useCallback(() => results.get(sessionId), [sessionId]);
  return useSyncExternalStore(sub, snap);
}
