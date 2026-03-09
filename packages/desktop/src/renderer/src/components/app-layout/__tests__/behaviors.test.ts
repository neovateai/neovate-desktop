import { describe, it, expect } from "vitest";

import type { LayoutContext } from "../types";

import { open, overflow } from "../behaviors";

function makeCtx(overrides: Partial<LayoutContext> = {}): LayoutContext {
  return {
    windowWidth: 1200,
    panels: {
      primarySidebar: { width: 300, collapsed: false },
      chatPanel: { width: 500, collapsed: false },
      contentPanel: { width: 300, collapsed: true },
      secondarySidebar: { width: 240, collapsed: true },
    },
    ...overrides,
  };
}

describe("open behaviors", () => {
  describe("restore", () => {
    it("returns stored width unchanged", () => {
      const fn = open.restore();
      expect(fn(350, makeCtx())).toBe(350);
    });
  });

  describe("splitWith", () => {
    it("computes available space ratio on first open", () => {
      const fn = open.splitWith(300, 0.5);
      const ctx = makeCtx();
      // storedWidth === defaultWidth → first open
      // window=1200, used = 40+8 (fixed) + 300+5 (primary) + 500+5 (chat) = 858
      // available = 1200 - 858 - 5 (new handle) = 337
      // result = max(300, floor(337 * 0.5)) = 300
      expect(fn(300, ctx)).toBe(300);
    });

    it("returns stored width on subsequent opens", () => {
      const fn = open.splitWith(300, 0.5);
      const ctx = makeCtx();
      // storedWidth !== defaultWidth → not first open
      expect(fn(450, ctx)).toBe(450);
    });
  });
});

describe("overflow behaviors", () => {
  it("shrinkable has correct priority", () => {
    expect(overflow.shrinkable(2).priority).toBe(2);
  });

  it("shrink gives up to width - min, capped by excess", () => {
    const { shrink } = overflow.shrinkable(1);
    expect(shrink(500, 300, 100)).toBe(100); // excess < available → give excess
    expect(shrink(500, 300, 300)).toBe(200); // excess > available → give width - min
    expect(shrink(300, 300, 100)).toBe(0); // at min → give nothing
  });
});
