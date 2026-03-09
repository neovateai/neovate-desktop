import { useCallback, useRef } from "react";

// biome-ignore lint/suspicious/noExplicitAny: generic callback wrapper
export function useEventCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  // biome-ignore lint/suspicious/noExplicitAny: generic callback wrapper
  return useCallback((...args: any[]) => ref.current(...args), []) as T;
}
