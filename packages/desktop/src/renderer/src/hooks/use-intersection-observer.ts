import { type RefObject, useEffect, useState } from "react";

export function useIntersectionObserver(
  ref: RefObject<Element | null>,
  options: { rootMargin?: string; threshold?: number } = {},
): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => setIsVisible(entry.isIntersecting), {
      rootMargin: options.rootMargin ?? "0px",
      threshold: options.threshold ?? 0,
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, options.rootMargin, options.threshold]);

  return isVisible;
}
