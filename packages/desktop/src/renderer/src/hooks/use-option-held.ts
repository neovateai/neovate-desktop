import { useEffect, useRef, useState } from "react";

/**
 * Returns `true` when the Option (Alt) key is held for at least `debounceMs`.
 * Resets on key-up and window blur.
 */
export function useOptionHeld(debounceMs = 80): boolean {
  const [held, setHeld] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt" && !e.repeat) {
        timerRef.current = setTimeout(() => setHeld(true), debounceMs);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        clearTimeout(timerRef.current);
        setHeld(false);
      }
    };

    const handleBlur = () => {
      clearTimeout(timerRef.current);
      setHeld(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [debounceMs]);

  return held;
}
