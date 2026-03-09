import { describe, it, expect, vi } from "vitest";

import type { PanelId, PanelState } from "../types";

// Mock orpc to avoid window dependency
vi.mock("../../../orpc", () => ({
  client: { window: { ensureWidth: vi.fn() } },
}));

const { mergePersisted } = await import("../store");

describe("persist merge", () => {
  const defaults: Record<PanelId, PanelState> = {
    primarySidebar: { width: 300, collapsed: false },
    chatPanel: { width: 0, collapsed: false },
    contentPanel: { width: 300, collapsed: true },
    secondarySidebar: { width: 240, collapsed: true, activeView: "git" },
  };

  function current() {
    return { panels: { ...defaults } };
  }

  it("restores valid persisted widths", () => {
    const result = mergePersisted(
      { panels: { primarySidebar: { width: 400, collapsed: false } } },
      current(),
    );
    expect(result.panels.primarySidebar.width).toBe(400);
  });

  it("clamps width to panel min", () => {
    const result = mergePersisted(
      { panels: { primarySidebar: { width: 100, collapsed: false } } },
      current(),
    );
    expect(result.panels.primarySidebar.width).toBe(250);
  });

  it("clamps width to panel max", () => {
    const result = mergePersisted(
      { panels: { primarySidebar: { width: 900, collapsed: false } } },
      current(),
    );
    expect(result.panels.primarySidebar.width).toBe(600);
  });

  it("ignores chatPanel with zero width", () => {
    const result = mergePersisted(
      { panels: { chatPanel: { width: 0, collapsed: false } } },
      current(),
    );
    expect(result.panels.chatPanel.width).toBe(0); // keeps default
  });

  it("restores chatPanel with non-zero width", () => {
    const result = mergePersisted(
      { panels: { chatPanel: { width: 600, collapsed: false } } },
      current(),
    );
    expect(result.panels.chatPanel.width).toBe(600);
  });

  it("forces chatPanel to never be collapsed", () => {
    const result = mergePersisted(
      { panels: { chatPanel: { width: 500, collapsed: true } } },
      current(),
    );
    expect(result.panels.chatPanel.collapsed).toBe(false);
  });

  it("skips unknown panel IDs", () => {
    const result = mergePersisted(
      { panels: { unknownPanel: { width: 500, collapsed: false } } },
      current(),
    );
    expect(result.panels).toEqual(defaults);
  });

  it("skips malformed panel entries", () => {
    const result = mergePersisted({ panels: { primarySidebar: "not an object" } }, current());
    expect(result.panels.primarySidebar).toEqual(defaults.primarySidebar);
  });

  it("skips entries with non-number width", () => {
    const result = mergePersisted(
      { panels: { primarySidebar: { width: "wide", collapsed: false } } },
      current(),
    );
    expect(result.panels.primarySidebar).toEqual(defaults.primarySidebar);
  });

  it("skips entries with non-boolean collapsed", () => {
    const result = mergePersisted(
      { panels: { primarySidebar: { width: 400, collapsed: "yes" } } },
      current(),
    );
    expect(result.panels.primarySidebar).toEqual(defaults.primarySidebar);
  });

  it("skips entries with Infinity/NaN width", () => {
    const infResult = mergePersisted(
      { panels: { primarySidebar: { width: Infinity, collapsed: false } } },
      current(),
    );
    expect(infResult.panels.primarySidebar).toEqual(defaults.primarySidebar);

    const nanResult = mergePersisted(
      { panels: { primarySidebar: { width: NaN, collapsed: false } } },
      current(),
    );
    expect(nanResult.panels.primarySidebar).toEqual(defaults.primarySidebar);
  });

  it("returns current when persisted is undefined", () => {
    const c = current();
    expect(mergePersisted(undefined, c)).toBe(c);
  });

  it("returns current when persisted has no panels", () => {
    const c = current();
    expect(mergePersisted({}, c)).toBe(c);
  });

  it("preserves activeView from persisted state", () => {
    const result = mergePersisted(
      {
        panels: {
          secondarySidebar: {
            width: 280,
            collapsed: false,
            activeView: "files",
          },
        },
      },
      current(),
    );
    expect(result.panels.secondarySidebar.activeView).toBe("files");
    expect(result.panels.secondarySidebar.width).toBe(280);
  });
});
