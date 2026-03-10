import { describe, it, expect } from "vitest";

import type { PanelMap } from "../types";

import {
  shrinkPanelsToFit,
  computeMinWindowWidth,
  applyDelta,
  isSeparatorVisible,
} from "../layout-coordinator";

describe("resize flow integration", () => {
  it("opening all panels then fitting to small window shrinks by priority", () => {
    const panels: PanelMap = {
      primarySidebar: { width: 400, collapsed: false },
      chatPanel: { width: 500, collapsed: false },
      contentPanel: { width: 500, collapsed: false },
      secondarySidebar: { width: 400, collapsed: false },
    };
    const result = shrinkPanelsToFit(panels, 1200);
    // chatPanel (priority 3) shrinks first, then contentPanel (2), secondary (1), primary (0)
    expect(result.chatPanel.width).toBeLessThanOrEqual(500);
  });

  it("computeMinWindowWidth returns sane value for default layout", () => {
    const panels: PanelMap = {
      primarySidebar: { width: 300, collapsed: false },
      chatPanel: { width: 500, collapsed: false },
      contentPanel: { width: 300, collapsed: true },
      secondarySidebar: { width: 240, collapsed: true },
    };
    const minWidth = computeMinWindowWidth(panels);
    // fixed(48) + primary(250) + chat(320) + 1 handle(5) = 623
    expect(minWidth).toBe(623);
  });

  it("computeMinWindowWidth grows when more panels are expanded", () => {
    const collapsed: PanelMap = {
      primarySidebar: { width: 300, collapsed: false },
      chatPanel: { width: 500, collapsed: false },
      contentPanel: { width: 300, collapsed: true },
      secondarySidebar: { width: 240, collapsed: true },
    };
    const expanded: PanelMap = {
      primarySidebar: { width: 300, collapsed: false },
      chatPanel: { width: 500, collapsed: false },
      contentPanel: { width: 300, collapsed: false },
      secondarySidebar: { width: 240, collapsed: false },
    };
    expect(computeMinWindowWidth(expanded)).toBeGreaterThan(computeMinWindowWidth(collapsed));
  });

  it("bulldozer drag through entire layout is conservative", () => {
    const panels: PanelMap = {
      primarySidebar: { width: 300, collapsed: false },
      chatPanel: { width: 500, collapsed: false },
      contentPanel: { width: 400, collapsed: false },
      secondarySidebar: { width: 300, collapsed: false },
    };
    // Drag separator 0 all the way right — capped by primarySidebar max (600)
    const result = applyDelta(panels, 0, 1000);
    // growRoom = 600 - 300 = 300
    // shrinkable: chat(180) + content(100) + secondary(60) = 340 > 300, so cap at 300
    // Shrink order: chat first (adjacent), then content, then secondary
    // chat gives 180, content gives 100, secondary gives 20 (300-180-100=20)
    expect(result.chatPanel.width).toBe(320); // at min
    expect(result.contentPanel.width).toBe(300); // at min
    expect(result.secondarySidebar.width).toBe(280); // partially shrunk
    expect(result.primarySidebar.width).toBe(600); // at max
    // Verify conservation: total before == total after
    const before = 300 + 500 + 400 + 300;
    const after =
      result.primarySidebar.width +
      result.chatPanel.width +
      result.contentPanel.width +
      result.secondarySidebar.width;
    expect(after).toBe(before);
  });

  it("separator visibility and bulldozer are consistent across collapsed gap", () => {
    const panels: PanelMap = {
      primarySidebar: { width: 300, collapsed: false },
      chatPanel: { width: 500, collapsed: false },
      contentPanel: { width: 350, collapsed: true },
      secondarySidebar: { width: 300, collapsed: false },
    };

    // sep 2 should be visible (bridges chat↔secondary)
    expect(isSeparatorVisible(panels, 2)).toBe(true);
    // sep 1 should be hidden (content collapsed)
    expect(isSeparatorVisible(panels, 1)).toBe(false);

    // Drag right on sep 2 should grow chat, shrink secondary
    const right = applyDelta(panels, 2, 30);
    expect(right.chatPanel.width).toBe(530);
    expect(right.secondarySidebar.width).toBe(270);

    // Drag left on sep 2 should grow secondary, shrink chat
    const left = applyDelta(panels, 2, -30);
    expect(right.contentPanel.width).toBe(350); // unchanged
    expect(left.secondarySidebar.width).toBe(330);
    expect(left.chatPanel.width).toBe(470);
    expect(left.contentPanel.width).toBe(350); // unchanged
  });
});
