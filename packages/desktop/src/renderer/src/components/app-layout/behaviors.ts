import type { OpenBehavior, OverflowBehavior } from "./types";

import {
  APP_LAYOUT_ACTIVITY_BAR_WIDTH,
  APP_LAYOUT_EDGE_SPACING,
  APP_LAYOUT_RESIZE_HANDLE_WIDTH,
} from "./constants";

export const open = {
  restore(): OpenBehavior {
    return (storedWidth) => storedWidth;
  },
  splitWith(defaultWidth: number, ratio: number): OpenBehavior {
    return (storedWidth, ctx) => {
      if (storedWidth !== defaultWidth) return storedWidth;
      const { windowWidth, panels } = ctx;
      let used = APP_LAYOUT_ACTIVITY_BAR_WIDTH + APP_LAYOUT_EDGE_SPACING;
      for (const panel of Object.values(panels)) {
        if (!panel.collapsed) used += panel.width + APP_LAYOUT_RESIZE_HANDLE_WIDTH;
      }
      const available = windowWidth - used - APP_LAYOUT_RESIZE_HANDLE_WIDTH;
      return Math.max(defaultWidth, Math.floor(available * ratio));
    };
  },
};

export const overflow = {
  /** Shrinks up to (currentWidth - minWidth), capped by excess. Higher priority shrinks first. */
  shrinkable(priority: number): OverflowBehavior {
    return {
      priority,
      shrink: (currentWidth, minWidth, excess) => Math.min(currentWidth - minWidth, excess),
    };
  },
};
