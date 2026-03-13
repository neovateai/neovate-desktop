import { describe, it, expect } from "vitest";

import type { PanelMap, LayoutContext } from "../types";

import {
  constrainWidth,
  computeMaxAvailableWidth,
  shrinkPanelsToFit,
  computeMinWindowWidth,
  computeTotalWidth,
  setPanelWidth,
  applyDelta,
  isSeparatorVisible,
} from "../layout-coordinator";
import { getDescriptor } from "../panel-descriptors";

function makePanels(
  overrides: Partial<Record<string, { width: number; collapsed: boolean }>> = {},
): PanelMap {
  return {
    primarySidebar: { width: 300, collapsed: false },
    chatPanel: { width: 500, collapsed: false },
    contentPanel: { width: 300, collapsed: true },
    secondarySidebar: { width: 240, collapsed: true },
    ...overrides,
  };
}

function makeCtx(panels?: PanelMap, windowWidth = 1200): LayoutContext {
  return { windowWidth, panels: panels ?? makePanels() };
}

describe("constrainWidth", () => {
  it("clamps below min", () => {
    const desc = getDescriptor("primarySidebar");
    expect(constrainWidth(desc, 100, makeCtx())).toBe(250);
  });

  it("clamps above max", () => {
    const desc = getDescriptor("primarySidebar");
    expect(constrainWidth(desc, 700, makeCtx())).toBe(600);
  });

  it("passes through valid width", () => {
    const desc = getDescriptor("primarySidebar");
    expect(constrainWidth(desc, 400, makeCtx())).toBe(400);
  });
});

describe("computeMaxAvailableWidth", () => {
  it("limits panel based on available space", () => {
    const ctx = makeCtx(makePanels(), 800);
    const desc = getDescriptor("primarySidebar");
    const max = computeMaxAvailableWidth(desc, ctx);
    expect(max).toBeLessThan(800);
    expect(max).toBeGreaterThan(0);
  });
});

describe("shrinkPanelsToFit", () => {
  it("returns panels unchanged when they fit", () => {
    const panels = makePanels();
    const result = shrinkPanelsToFit(panels, 1200);
    expect(result).toEqual(panels);
  });

  it("shrinks panels when they overflow", () => {
    const panels = makePanels({
      chatPanel: { width: 500, collapsed: false },
      contentPanel: { width: 500, collapsed: false },
      secondarySidebar: { width: 400, collapsed: false },
    });
    const result = shrinkPanelsToFit(panels, 900);
    expect(result.chatPanel.width).toBeLessThanOrEqual(500);
  });
});

describe("computeMinWindowWidth", () => {
  it("sums min widths of expanded panels plus fixed elements and handles", () => {
    const panels = makePanels();
    const minWidth = computeMinWindowWidth(panels);
    // fixed(48) + primary(250) + chat(320) + 1 handle between them(5) = 623
    expect(minWidth).toBe(623);
  });

  it("counts handles correctly with all panels expanded", () => {
    const panels = makePanels({
      contentPanel: { width: 300, collapsed: false },
      secondarySidebar: { width: 240, collapsed: false },
    });
    const minWidth = computeMinWindowWidth(panels);
    // fixed(48) + primary(250) + chat(320) + content(300) + secondary(240) + 3 handles(15) = 1173
    expect(minWidth).toBe(1173);
  });
});

describe("applyDelta", () => {
  it("drag right: grows left panel, shrinks right panel", () => {
    const panels = makePanels();
    const result = applyDelta(panels, 0, 50);
    expect(result.primarySidebar.width).toBe(350);
    expect(result.chatPanel.width).toBe(450);
  });

  it("drag left: grows right panel, shrinks left panel", () => {
    const panels = makePanels();
    const result = applyDelta(panels, 0, -50);
    expect(result.primarySidebar.width).toBe(250); // min
    expect(result.chatPanel.width).toBe(550);
  });

  it("bulldozes through multiple panels when dragging right", () => {
    const panels = makePanels({
      chatPanel: { width: 400, collapsed: false },
      contentPanel: { width: 350, collapsed: false },
      secondarySidebar: { width: 300, collapsed: false },
    });
    // separator 0: drag right 600 — capped by primarySidebar max (600-300=300 room)
    // shrink: chat gives 80, content gives 50, secondary gives 60 = 190 available
    // but grow room is 300, so cap is min(600, 300) = 300, but only 190 shrinkable
    const result = applyDelta(panels, 0, 600);
    expect(result.chatPanel.width).toBe(320); // at min
    expect(result.contentPanel.width).toBe(300); // at min
    expect(result.secondarySidebar.width).toBe(240); // at min
    expect(result.primarySidebar.width).toBe(300 + 190); // grew by consumed
  });

  it("bulldozes through multiple panels when dragging left", () => {
    const panels = makePanels({
      chatPanel: { width: 400, collapsed: false },
      contentPanel: { width: 350, collapsed: false },
    });
    // separator 1: drag left 500 — contentPanel max is Infinity, so no cap from grow side
    // shrink: chat gives 80, primary gives 50 = 130 total
    const result = applyDelta(panels, 1, -500);
    expect(result.chatPanel.width).toBe(320); // at min
    expect(result.primarySidebar.width).toBe(250); // at min
    expect(result.contentPanel.width).toBe(350 + 130); // grew by consumed
  });

  it("skips collapsed panels", () => {
    const panels = makePanels({
      chatPanel: { width: 400, collapsed: false },
      contentPanel: { width: 350, collapsed: true },
      secondarySidebar: { width: 300, collapsed: false },
    });
    // separator 1: drag right — grow side is chatPanel (not collapsed)
    // shrink side walks right: contentPanel collapsed (skip), secondarySidebar gives 60
    const result = applyDelta(panels, 1, 100);
    expect(result.contentPanel.width).toBe(350); // unchanged (collapsed)
    expect(result.secondarySidebar.width).toBe(240); // at min
    expect(result.chatPanel.width).toBe(400 + 60); // grew by 60
  });

  it("returns same panels on zero delta", () => {
    const panels = makePanels();
    expect(applyDelta(panels, 0, 0)).toBe(panels);
  });

  it("caps shrink to grow room (conservative)", () => {
    const panels = makePanels({
      primarySidebar: { width: 580, collapsed: false },
      chatPanel: { width: 500, collapsed: false },
    });
    // separator 0: drag right 100 — primarySidebar max 600, room = 20
    // only 20px of shrink applied to chatPanel, not 100
    const result = applyDelta(panels, 0, 100);
    expect(result.primarySidebar.width).toBe(600); // capped at max
    expect(result.chatPanel.width).toBe(480); // shrunk by only 20
  });

  it("returns unchanged when grow panel is collapsed", () => {
    const panels = makePanels({
      primarySidebar: { width: 300, collapsed: true },
    });
    // separator 0: drag right — grow side (primarySidebar) is collapsed
    const result = applyDelta(panels, 0, 50);
    expect(result).toBe(panels);
  });

  it("drags across collapsed middle panel (right)", () => {
    const panels = makePanels({
      chatPanel: { width: 500, collapsed: false },
      contentPanel: { width: 350, collapsed: true },
      secondarySidebar: { width: 300, collapsed: false },
    });
    // sep 2 visible (bridges chat↔secondary), drag right grows chatPanel, shrinks secondarySidebar
    const result = applyDelta(panels, 2, 50);
    expect(result.chatPanel.width).toBe(550);
    expect(result.secondarySidebar.width).toBe(250);
    expect(result.contentPanel.width).toBe(350); // unchanged
  });

  it("drags across collapsed middle panel (left)", () => {
    const panels = makePanels({
      chatPanel: { width: 500, collapsed: false },
      contentPanel: { width: 350, collapsed: true },
      secondarySidebar: { width: 300, collapsed: false },
    });
    // sep 2, drag left grows secondarySidebar, shrinks chatPanel
    const result = applyDelta(panels, 2, -50);
    expect(result.secondarySidebar.width).toBe(350);
    expect(result.chatPanel.width).toBe(450);
    expect(result.contentPanel.width).toBe(350); // unchanged
  });
});

describe("isSeparatorVisible", () => {
  it("shows handle between adjacent expanded panels", () => {
    const panels = makePanels();
    expect(isSeparatorVisible(panels, 0)).toBe(true); // primary↔chat
  });

  it("hides handle when right panel is collapsed", () => {
    const panels = makePanels();
    expect(isSeparatorVisible(panels, 1)).toBe(false); // chat↔content (content collapsed)
  });

  it("shows handle across collapsed gap", () => {
    const panels = makePanels({
      contentPanel: { width: 300, collapsed: true },
      secondarySidebar: { width: 240, collapsed: false },
    });
    // sep 2 bridges chat↔secondary across collapsed contentPanel
    expect(isSeparatorVisible(panels, 2)).toBe(true);
    // sep 1 should NOT be visible (content is collapsed on right)
    expect(isSeparatorVisible(panels, 1)).toBe(false);
  });

  it("hides all handles when only one panel expanded", () => {
    const panels = makePanels({
      primarySidebar: { width: 300, collapsed: true },
      chatPanel: { width: 500, collapsed: false },
      contentPanel: { width: 300, collapsed: true },
      secondarySidebar: { width: 240, collapsed: true },
    });
    expect(isSeparatorVisible(panels, 0)).toBe(false);
    expect(isSeparatorVisible(panels, 1)).toBe(false);
    expect(isSeparatorVisible(panels, 2)).toBe(false);
  });
});

describe("computeMinWindowWidth with non-adjacent panels", () => {
  it("counts handles across collapsed gaps", () => {
    const panels = makePanels({
      contentPanel: { width: 300, collapsed: true },
      secondarySidebar: { width: 240, collapsed: false },
    });
    // primary(exp), chat(exp), content(col), secondary(exp)
    // 2 visible handles: primary↔chat, chat↔secondary (across collapsed content)
    // fixed(48) + primary(250) + chat(320) + secondary(240) + 2 handles(10) = 868
    const minWidth = computeMinWindowWidth(panels);
    expect(minWidth).toBe(868);
  });
});

describe("maximize convergence", () => {
  it("converges when contentPanel is proposed at extreme width", () => {
    const panels = makePanels({
      contentPanel: { width: 300, collapsed: false },
      secondarySidebar: { width: 240, collapsed: false },
    });

    const proposed = setPanelWidth(panels, "contentPanel", Number.MAX_SAFE_INTEGER);
    const resolved = shrinkPanelsToFit(proposed, 1200);

    expect(Number.isFinite(resolved.contentPanel.width)).toBe(true);
    expect(computeTotalWidth(resolved)).toBeLessThanOrEqual(1200);
    expect(resolved.primarySidebar.width).toBeGreaterThanOrEqual(250);
    expect(resolved.chatPanel.width).toBeGreaterThanOrEqual(320);
    expect(resolved.contentPanel.width).toBeGreaterThanOrEqual(300);
    expect(resolved.secondarySidebar.width).toBeGreaterThanOrEqual(240);
  });
});
