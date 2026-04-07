import { useCallback, useRef, useState } from "react";

export function useOperationKeys() {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const keysRef = useRef<Set<string>>(new Set());

  const add = useCallback((key: string) => {
    keysRef.current.add(key);
    setKeys(new Set(keysRef.current));
    return keysRef.current;
  }, []);

  const remove = useCallback((key: string, deep = false) => {
    keysRef.current.delete(key);
    if (deep) {
      const toDelete = [...keysRef.current].filter((k) => k.startsWith(key + "/"));
      for (const k of toDelete) {
        keysRef.current.delete(k);
      }
    }
    setKeys(new Set(keysRef.current));
  }, []);

  const replace = useCallback((oldKey: string, newKey: string) => {
    if (keysRef.current.has(oldKey)) {
      keysRef.current.delete(oldKey);
      keysRef.current.add(newKey);
    }
    setKeys(new Set(keysRef.current));
  }, []);

  const reset = useCallback(() => {
    keysRef.current.clear();
    setKeys(new Set());
  }, []);

  const only = useCallback((key: string) => {
    keysRef.current = new Set([key]);
    setKeys(new Set(keysRef.current));
  }, []);

  const has = useCallback((key: string) => {
    return keysRef.current.has(key);
  }, []);

  return { keys, size: keys.size, has, add, remove, replace, reset, only };
}
