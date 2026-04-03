import type { RefObject } from "react";
import type { StickToBottomContext } from "use-stick-to-bottom";

import debug from "debug";
import { useEffect, useLayoutEffect } from "react";

import { scrollPositions } from "../scroll-positions";

const log = debug("neovate:agent-scroll");

type ScrollBehavior = "smooth" | false;

/**
 * Saves and restores scroll position per session.
 * Returns the `initial` prop to pass to `<Conversation>`.
 */
export function useScrollPosition(
  sessionId: string,
  contextRef: RefObject<StickToBottomContext | null>,
): { initialScrollBehavior: ScrollBehavior } {
  const savedScrollTop = scrollPositions.get(sessionId);
  const hasSavedPosition = savedScrollTop != null;

  // Restore scroll position before paint
  useLayoutEffect(() => {
    if (savedScrollTop == null) {
      log("restore: sid=%s skipped (no saved position)", sessionId.slice(0, 8));
      return;
    }

    const el = contextRef.current?.scrollRef.current;
    if (!el) {
      log(
        "restore: sid=%s FAILED (scrollRef unavailable, contextRef=%s)",
        sessionId.slice(0, 8),
        contextRef.current ? "set" : "null",
      );
      return;
    }

    el.scrollTop = savedScrollTop;
    log(
      "restore: sid=%s scrollTop=%d (actual=%d, scrollHeight=%d, clientHeight=%d)",
      sessionId.slice(0, 8),
      savedScrollTop,
      el.scrollTop,
      el.scrollHeight,
      el.clientHeight,
    );
  }, []); // only on mount

  // Save scroll position on scroll (debounced) and on unmount
  useEffect(() => {
    const el = contextRef.current?.scrollRef.current;
    if (!el) {
      log("save-effect: sid=%s skipped (scrollRef unavailable)", sessionId.slice(0, 8));
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    let userHasScrolled = false;
    const handleScroll = () => {
      userHasScrolled = true;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 1;
        if (atBottom) {
          scrollPositions.delete(sessionId);
        } else {
          scrollPositions.set(sessionId, el.scrollTop);
        }
        log(
          "scroll: sid=%s atBottom=%s scrollTop=%d",
          sessionId.slice(0, 8),
          atBottom,
          el.scrollTop,
        );
      }, 200);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearTimeout(timeoutId);
      el.removeEventListener("scroll", handleScroll);
      // Skip save if element is detached or no user scroll occurred (Strict Mode)
      if (el.scrollHeight === 0 || !userHasScrolled) {
        log(
          "unmount: sid=%s skipped (detached=%s userScrolled=%s)",
          sessionId.slice(0, 8),
          el.scrollHeight === 0,
          userHasScrolled,
        );
        return;
      }
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 1;
      if (atBottom) {
        scrollPositions.delete(sessionId);
      } else {
        scrollPositions.set(sessionId, el.scrollTop);
      }
      log("unmount: sid=%s saved=%s scrollTop=%d", sessionId.slice(0, 8), !atBottom, el.scrollTop);
    };
  }, [sessionId]);

  return { initialScrollBehavior: hasSavedPosition ? false : "smooth" };
}
