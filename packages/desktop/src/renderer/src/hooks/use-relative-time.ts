import { formatDistanceToNowStrict } from "date-fns";
import { useSyncExternalStore } from "react";

// Tick every 60s. The useSyncExternalStore snapshot comparison means only items
// whose formatted string actually changed trigger a re-render.
const TICK_INTERVAL_MS = 60_000;

const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function cleanup() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  listeners.clear();
}

function notifyAll() {
  const notify = () => {
    for (const listener of listeners) listener();
  };
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(notify);
  } else {
    notify();
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  if (listeners.size === 1) {
    intervalId = setInterval(notifyAll, TICK_INTERVAL_MS);
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) cleanup();
  };
}

// Refresh immediately on wake from sleep / tab-foreground so timestamps
// don't sit stale for up to TICK_INTERVAL_MS after the user returns.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && listeners.size > 0) {
      notifyAll();
    }
  });
}

// Clean up leaked intervals on Vite HMR
if (import.meta.hot) {
  import.meta.hot.dispose(cleanup);
}

export function formatRelativeTime(iso: string): string {
  const distance = formatDistanceToNowStrict(new Date(iso), { addSuffix: false });
  return distance
    .replace(/ seconds?/, "s")
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d")
    .replace(/ months?/, "mo")
    .replace(/ years?/, "y");
}

export function useRelativeTime(iso: string): string {
  return useSyncExternalStore(subscribe, () => formatRelativeTime(iso));
}
