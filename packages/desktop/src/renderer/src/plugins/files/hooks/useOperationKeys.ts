import { useCallback, useRef, useState } from "react";

export function useOperationKeys() {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const keysRef = useRef<Set<string>>(new Set());

  const add = useCallback((key: string) => {
    setKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      keysRef.current = next;
      return next;
    });
    return keysRef.current;
  }, []);

  const remove = useCallback((key: string, deep = false) => {
    setKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      if (deep) {
        const toDelete = [...next].filter((k) => k.startsWith(key + "/"));
        for (const k of toDelete) {
          next.delete(k);
        }
      }
      keysRef.current = next;
      return next;
    });
  }, []);

  const replace = useCallback((oldKey: string, newKey: string) => {
    setKeys((prev) => {
      if (!prev.has(oldKey)) return prev;
      const next = new Set(prev);
      next.delete(oldKey);
      next.add(newKey);
      keysRef.current = next;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setKeys(() => {
      const next = new Set<string>();
      keysRef.current = next;
      return next;
    });
  }, []);

  const only = useCallback((key: string) => {
    setKeys((prev) => {
      if (prev.size === 1 && prev.has(key)) return prev;
      const next = new Set([key]);
      keysRef.current = next;
      return next;
    });
  }, []);

  const has = useCallback((key: string) => {
    return keysRef.current.has(key);
  }, []);

  const getKeys = () => {
    return keysRef.current;
  };

  return { keys, size: keys.size, has, add, remove, replace, reset, only, getKeys };
}
