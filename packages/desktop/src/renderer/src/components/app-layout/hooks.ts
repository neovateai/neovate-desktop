import { useEffect, useLayoutEffect } from "react";

import { client } from "../../orpc";
import { shrinkPanelsToFit, computeMinWindowWidth, setPanelWidth } from "./layout-coordinator";
import { applyDelta } from "./layout-coordinator";
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

/** Shrinks explicit-width panels on overflow and syncs chatPanel width from DOM after resize. */
function useShrinkPanelsOnWindowResize() {
  useEffect(() => {
    const fit = () => {
      const { panels } = layoutStore.getState();
      const windowWidth = window.innerWidth;

      // Shrink explicit-width panels if they overflow
      const newPanels = shrinkPanelsToFit(panels, windowWidth);
      if (newPanels !== panels) {
        layoutStore.setState({ panels: newPanels });
      }

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

    fit();
    let rafId = 0;
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fit);
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

    const onPointerMove = (e: PointerEvent) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      const delta = e.clientX - initialX;
      const newPanels = applyDelta(initialPanels, separatorIndex, delta);
      layoutStore.setState({ panels: newPanels });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.defaultPrevented) return;
      stopResize();
    };

    const onCancel = () => stopResize();

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

/** Composes all panel resize hooks: window min sync, chat sync, fit-on-resize, and drag handling. */
export function usePanelResize() {
  useSyncWindowMinWidth();
  useSyncChatPanelWidth();
  useShrinkPanelsOnWindowResize();
  usePanelDrag();
}
