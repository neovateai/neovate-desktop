import debug from "debug";
import { useEffect, useLayoutEffect, useRef } from "react";

import { client } from "../../orpc";

const log = debug("neovate:layout");
import {
  computeMinWindowWidth,
  setPanelWidth,
  adjustPanelsForWindowDelta,
  applyDelta,
} from "./layout-coordinator";
import { useLayoutStore, layoutStore } from "./store";

/** Syncs the OS minimum window width via IPC whenever panels change (debounced 100ms). */
function useSyncWindowMinWidth() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = layoutStore.subscribe(
      (s) => s.panels,
      (panels) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const required = computeMinWindowWidth(panels);
          log("sync window min width", { required });
          void client.window.ensureWidth({ minWidth: required }).catch(() => {});
        }, 100);
      },
    );
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}

/** Syncs chatPanel's store width from its actual DOM size (it renders as flex-1). */
function syncChatPanelWidthFromDOM() {
  const el = document.querySelector('[data-slot="chat-panel"]');
  if (!el) return;
  const { panels } = layoutStore.getState();
  const chatWidth = el.getBoundingClientRect().width;
  if (chatWidth > 0 && Math.abs(chatWidth - panels.chatPanel.width) > 1) {
    layoutStore.setState({ panels: setPanelWidth(panels, "chatPanel", chatWidth) });
  }
}

function useSyncChatPanelWidth() {
  // Sync on mount
  useLayoutEffect(() => {
    syncChatPanelWidthFromDOM();
  }, []);

  // Re-sync after any panel state change (collapse/expand animations settle)
  useEffect(() => {
    const unsubscribe = layoutStore.subscribe(
      (s) => s.panels,
      () => {
        // Wait for layout to settle after collapse/expand animation
        requestAnimationFrame(() => syncChatPanelWidthFromDOM());
      },
    );
    return unsubscribe;
  }, []);
}

/**
 * Adjusts panels when window width changes.
 * If contentPanel is expanded, it absorbs the window change (grow or shrink).
 * If contentPanel is collapsed, chatPanel absorbs the change automatically (flex-1).
 */
function useAdjustPanelsOnWindowResize() {
  const previousWidthRef = useRef<number>(window.innerWidth);

  useEffect(() => {
    const adjust = () => {
      const { panels } = layoutStore.getState();
      const currentWidth = window.innerWidth;
      const previousWidth = previousWidthRef.current;

      // Adjust panels based on window delta
      const newPanels = adjustPanelsForWindowDelta(panels, previousWidth, currentWidth);
      if (newPanels !== panels) {
        log("adjusted panels for window delta", {
          delta: currentWidth - previousWidth,
          contentPanelCollapsed: panels.contentPanel.collapsed,
        });
        layoutStore.setState({ panels: newPanels });
      }

      // Update previous width for next resize
      previousWidthRef.current = currentWidth;

      // Sync chatPanel store width from DOM (flex-1 auto-adjusts visually)
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-slot="chat-panel"]');
        if (!el) return;
        const { panels: currentPanels } = layoutStore.getState();
        const chatWidth = el.getBoundingClientRect().width;
        if (chatWidth > 0 && chatWidth !== currentPanels.chatPanel.width) {
          layoutStore.setState({ panels: setPanelWidth(currentPanels, "chatPanel", chatWidth) });
        }
      });
    };

    adjust();
    let rafId = 0;
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(adjust);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
    };
  }, []);
}

/** Attaches global pointer listeners while a resize drag is active, using bulldozer algorithm. */
function usePanelDrag() {
  const resizing = useLayoutStore((s) => s.resizing);
  const stopResize = useLayoutStore((s) => s.stopResize);

  useEffect(() => {
    if (!resizing) return;
    const { separatorIndex, initialX, initialPanels } = resizing;
    log("drag start", { separatorIndex });

    const onPointerMove = (e: PointerEvent) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      const delta = e.clientX - initialX;
      const newPanels = applyDelta(initialPanels, separatorIndex, delta);
      layoutStore.setState({ panels: newPanels });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.defaultPrevented) return;
      log("drag stop");
      stopResize();
    };

    const onCancel = () => {
      log("drag cancelled");
      stopResize();
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
    };
  }, [resizing, stopResize]);
}

/** Composes all panel resize hooks: window min sync, chat sync, adjust-on-resize, and drag handling. */
export function usePanelResize() {
  useSyncWindowMinWidth();
  useSyncChatPanelWidth();
  useAdjustPanelsOnWindowResize();
  usePanelDrag();
}
