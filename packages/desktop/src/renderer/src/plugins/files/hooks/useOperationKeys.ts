import { useRef, useState } from "react";

export function useOperationKeys() {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const keysRef = useRef<Set<string>>(new Set());

  const add = (key: string) => {
    keysRef.current.add(key);
    setKeys(new Set(keysRef.current));
    return keysRef.current;
  };

  const remove = (key: string, deep = false) => {
    keysRef.current.delete(key);
    if (deep) {
      const toDelete = [...keysRef.current].filter((k) => k.startsWith(key + "/"));
      for (const k of toDelete) {
        keysRef.current.delete(k);
      }
    }
    setKeys(new Set(keysRef.current));
  };

  const replace = (oldKey: string, newKey: string) => {
    if (keysRef.current.has(oldKey)) {
      keysRef.current.delete(oldKey);
      keysRef.current.add(newKey);
    }
    setKeys(new Set(keysRef.current));
  };

  const reset = () => {
    keysRef.current.clear();
    setKeys(new Set());
  };

  const only = (key: string) => {
    keysRef.current = new Set([key]);
    setKeys(new Set(keysRef.current));
  };

  const has = (key: string) => {
    return keysRef.current.has(key);
  };

  return { keys, size: keys.size, has, add, remove, replace, reset, only };
}
