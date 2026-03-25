import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { ContentPanelView } from "../../../core/plugin/contributions";
import type { IWorkbenchLayoutService } from "../../../core/workbench/layout";
import type { ContentPanelOptions } from "../content-panel";

import { ContentPanel } from "../content-panel";

const PROJECT = "/test/project";

const VIEWS: ContentPanelView[] = [
  {
    viewType: "terminal",
    name: "Terminal",
    singleton: false,
    component: () => Promise.resolve({ default: () => null }),
  },
  {
    viewType: "editor",
    name: "Editor",
    component: () => Promise.resolve({ default: () => null }),
  }, // singleton defaults to true
  {
    viewType: "search",
    name: "Search",
    persist: false,
    component: () => Promise.resolve({ default: () => null }),
  },
];

function makeOptions(overrides?: Partial<ContentPanelOptions>): ContentPanelOptions {
  return {
    views: VIEWS,
    load: vi.fn(() => Promise.resolve({})),
    save: vi.fn(() => Promise.resolve()),
    layout: {
      expandPart: vi.fn(),
      collapsePart: vi.fn(),
      togglePart: vi.fn(),
      maximizePart: vi.fn(),
    } satisfies IWorkbenchLayoutService,
    ...overrides,
  };
}

let panel: ContentPanel;
let options: ContentPanelOptions;

beforeEach(() => {
  options = makeOptions();
  panel = new ContentPanel(options);
  panel.setProjectPath(PROJECT);
});

// --- Store operations (via ContentPanel methods) ---

describe("openView", () => {
  it("returns a viewId and adds tab to store", () => {
    const id = panel.openView("terminal");
    expect(id).toBeTruthy();
    expect(panel.store.getState().getProjectState(PROJECT).tabs).toHaveLength(1);
  });

  it("passes initial state to new tab", () => {
    const id = panel.openView("terminal", { state: { url: "https://example.com" } });
    const state = panel.getViewState(id);
    expect(state).toEqual({ url: "https://example.com" });
  });

  it("expands contentPanel before opening a view", () => {
    panel.openView("terminal");
    expect(options.layout.expandPart).toHaveBeenCalledWith("contentPanel");
  });

  it("enforces singleton — activates existing instead of creating new", () => {
    const id1 = panel.openView("editor");
    const id2 = panel.openView("editor");
    expect(id1).toBe(id2);
    expect(panel.store.getState().getProjectState(PROJECT).tabs).toHaveLength(1);
  });

  it("expands contentPanel when reusing an existing singleton tab", () => {
    panel.openView("editor");
    vi.mocked(options.layout.expandPart).mockClear();

    panel.openView("editor");

    expect(options.layout.expandPart).toHaveBeenCalledWith("contentPanel");
  });

  it("allows multiple instances for non-singleton views", () => {
    const id1 = panel.openView("terminal");
    const id2 = panel.openView("terminal");
    expect(id1).not.toBe(id2);
    expect(panel.store.getState().getProjectState(PROJECT).tabs).toHaveLength(2);
  });

  it("throws for unknown viewType", () => {
    expect(() => panel.openView("unknown")).toThrow();
  });

  it("opens tab without activating when activate: false", () => {
    const id1 = panel.openView("terminal");
    const id2 = panel.openView("terminal", { activate: false });
    expect(panel.store.getState().getProjectState(PROJECT).tabs).toHaveLength(2);
    // id1 remains active
    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBe(id1);
    expect(id2).not.toBe(id1);
  });
});

describe("closeView", () => {
  it("removes the tab", () => {
    const id = panel.openView("terminal");
    panel.closeView(id);
    expect(panel.store.getState().getProjectState(PROJECT).tabs).toHaveLength(0);
  });

  it("closing active tab activates previous tab", () => {
    panel.openView("terminal");
    const id2 = panel.openView("terminal");
    const id3 = panel.openView("terminal");
    // id3 is active
    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBe(id3);

    panel.closeView(id3);
    // should fall back to id2 (previous by position)
    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBe(id2);
  });

  it("closing active tab activates first tab when no previous", () => {
    const id1 = panel.openView("terminal");
    const id2 = panel.openView("terminal");
    panel.activateView(id1);

    panel.closeView(id1);
    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBe(id2);
  });

  it("closing inactive tab preserves active", () => {
    const id1 = panel.openView("terminal");
    const id2 = panel.openView("terminal");
    // id2 is active
    panel.closeView(id1);
    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBe(id2);
  });

  it("closing last tab sets activeTabId to null", () => {
    const id = panel.openView("terminal");
    panel.closeView(id);
    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBeNull();
  });
});

describe("activateView", () => {
  it("sets activeTabId", () => {
    const id1 = panel.openView("terminal");
    panel.openView("terminal");
    panel.activateView(id1);

    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBe(id1);
  });
});

describe("getViewState / updateViewState", () => {
  it("reads and writes tab.state", () => {
    const id = panel.openView("terminal");
    panel.updateViewState(id, { cwd: "/foo" });
    expect(panel.getViewState(id)).toEqual({ cwd: "/foo" });
  });

  it("shallow merges state", () => {
    const id = panel.openView("terminal");
    panel.updateViewState(id, { cwd: "/foo" });
    panel.updateViewState(id, { env: "prod" });
    expect(panel.getViewState(id)).toEqual({ cwd: "/foo", env: "prod" });
  });
});

describe("registeredViewTypes", () => {
  it("returns set of registered view types", () => {
    expect(panel.registeredViewTypes).toEqual(new Set(["terminal", "editor", "search"]));
  });
});

// --- Persistence ---

describe("hydrate", () => {
  it("restores projects state from persistence", async () => {
    const saved = {
      [PROJECT]: {
        tabs: [{ id: "t1", viewType: "terminal", state: {} }],
        activeTabId: "t1",
      },
    };
    const opts = makeOptions({ load: vi.fn(() => Promise.resolve(saved)) });
    const p = new ContentPanel(opts);
    p.setProjectPath(PROJECT);

    await p.hydrate();

    const state = p.store.getState().getProjectState(PROJECT);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].id).toBe("t1");
    expect(state.activeTabId).toBe("t1");
    p.dispose();
  });

  it("does nothing when load returns empty object", async () => {
    await panel.hydrate();
    expect(panel.store.getState().getProjectState(PROJECT).tabs).toHaveLength(0);
    panel.dispose();
  });

  it("ignores non-object data (array)", async () => {
    const opts = makeOptions({ load: vi.fn(() => Promise.resolve([] as any)) });
    const p = new ContentPanel(opts);
    p.setProjectPath(PROJECT);
    await p.hydrate();
    expect(p.store.getState().getProjectState(PROJECT).tabs).toHaveLength(0);
    p.dispose();
  });

  it("ignores null from load", async () => {
    const opts = makeOptions({ load: vi.fn(() => Promise.resolve(null as any)) });
    const p = new ContentPanel(opts);
    p.setProjectPath(PROJECT);
    await p.hydrate();
    expect(p.store.getState().getProjectState(PROJECT).tabs).toHaveLength(0);
    p.dispose();
  });

  it("survives load() rejection", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const opts = makeOptions({
      load: vi.fn(() => Promise.reject(new Error("disk fail"))),
    });
    const p = new ContentPanel(opts);
    p.setProjectPath(PROJECT);
    // hydrate should not throw — it should handle gracefully or propagate
    await expect(p.hydrate()).rejects.toThrow("disk fail");
    consoleSpy.mockRestore();
    p.dispose();
  });

  it("starts observation after hydrate", async () => {
    await panel.hydrate();
    panel.openView("terminal");

    vi.useFakeTimers();
    panel.openView("terminal");
    vi.advanceTimersByTime(100);

    expect(options.save).toHaveBeenCalled();
    vi.useRealTimers();
    panel.dispose();
  });
});

describe("observe + flush", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces saves on store changes", async () => {
    vi.useFakeTimers();
    await panel.hydrate();

    panel.openView("terminal");
    panel.openView("terminal");

    // Not saved yet (debounced)
    expect(options.save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(options.save).toHaveBeenCalledTimes(1);
    // save receives filterPersistable(projects) — same content here since only persistable tabs opened
    const savedData = vi.mocked(options.save).mock.calls[0][0];
    expect(savedData[PROJECT].tabs).toHaveLength(2);

    panel.dispose();
  });

  it("dirty tracking avoids unnecessary writes", async () => {
    vi.useFakeTimers();
    await panel.hydrate();

    // No changes — dispose should not trigger save
    panel.dispose();
    expect(options.save).not.toHaveBeenCalled();
  });

  it("dispose flushes pending changes", async () => {
    vi.useFakeTimers();
    await panel.hydrate();

    panel.openView("terminal");
    // Timer pending, not yet flushed
    expect(options.save).not.toHaveBeenCalled();

    panel.dispose();
    expect(options.save).toHaveBeenCalledTimes(1);
  });

  it("dispose stops further saves", async () => {
    vi.useFakeTimers();
    await panel.hydrate();
    panel.dispose();

    panel.openView("terminal");
    vi.advanceTimersByTime(200);

    // Only the flush from dispose (if any dirty), no new saves
    expect(options.save).not.toHaveBeenCalled();
  });

  it("catches save errors without throwing", async () => {
    vi.useFakeTimers();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const opts = makeOptions({
      save: vi.fn(() => Promise.reject(new Error("write failed"))),
    });
    const p = new ContentPanel(opts);
    p.setProjectPath(PROJECT);
    await p.hydrate();

    p.openView("terminal");
    vi.advanceTimersByTime(100);

    // Let the rejected promise propagate
    await vi.advanceTimersByTimeAsync(0);

    expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
    consoleSpy.mockRestore();
    p.dispose();
  });
});

// --- persist option ---

describe("persist option", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flush excludes persist:false tabs from saved data", async () => {
    vi.useFakeTimers();
    await panel.hydrate();

    panel.openView("terminal");
    panel.openView("search"); // persist: false

    vi.advanceTimersByTime(100);

    expect(options.save).toHaveBeenCalledTimes(1);
    const savedData = vi.mocked(options.save).mock.calls[0][0];
    const savedTabs = savedData[PROJECT].tabs;
    expect(savedTabs).toHaveLength(1);
    expect(savedTabs[0].viewType).toBe("terminal");

    panel.dispose();
  });

  it("flush preserves unknown viewType tabs", async () => {
    vi.useFakeTimers();
    const saved = {
      [PROJECT]: {
        tabs: [{ id: "u1", viewType: "unknown-plugin", state: {} }],
        activeTabId: "u1",
      },
    };
    const opts = makeOptions({ load: vi.fn(() => Promise.resolve(saved)) });
    const p = new ContentPanel(opts);
    p.setProjectPath(PROJECT);
    await p.hydrate();

    p.openView("terminal");
    vi.advanceTimersByTime(100);

    const savedData = vi.mocked(opts.save).mock.calls[0][0];
    const viewTypes = savedData[PROJECT].tabs.map((t: any) => t.viewType);
    expect(viewTypes).toContain("unknown-plugin");
    expect(viewTypes).toContain("terminal");

    p.dispose();
  });

  it("hydrate filters persist:false tabs from loaded data", async () => {
    const saved = {
      [PROJECT]: {
        tabs: [
          { id: "t1", viewType: "terminal", state: {} },
          { id: "s1", viewType: "search", state: {} },
        ],
        activeTabId: "t1",
      },
    };
    const opts = makeOptions({ load: vi.fn(() => Promise.resolve(saved)) });
    const p = new ContentPanel(opts);
    p.setProjectPath(PROJECT);

    await p.hydrate();

    const state = p.store.getState().getProjectState(PROJECT);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].viewType).toBe("terminal");
    p.dispose();
  });

  it("hydrate falls back activeTabId to first remaining tab", async () => {
    const saved = {
      [PROJECT]: {
        tabs: [
          { id: "t1", viewType: "terminal", state: {} },
          { id: "s1", viewType: "search", state: {} },
        ],
        activeTabId: "s1", // points to persist:false tab
      },
    };
    const opts = makeOptions({ load: vi.fn(() => Promise.resolve(saved)) });
    const p = new ContentPanel(opts);
    p.setProjectPath(PROJECT);

    await p.hydrate();

    const state = p.store.getState().getProjectState(PROJECT);
    expect(state.activeTabId).toBe("t1");
    p.dispose();
  });

  it("all tabs filtered results in empty state", async () => {
    const saved = {
      [PROJECT]: {
        tabs: [{ id: "s1", viewType: "search", state: {} }],
        activeTabId: "s1",
      },
    };
    const opts = makeOptions({ load: vi.fn(() => Promise.resolve(saved)) });
    const p = new ContentPanel(opts);
    p.setProjectPath(PROJECT);

    await p.hydrate();

    const state = p.store.getState().getProjectState(PROJECT);
    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
    p.dispose();
  });

  it("preserves null activeTabId when no tabs were filtered", async () => {
    vi.useFakeTimers();
    await panel.hydrate();

    panel.openView("terminal", { activate: false });

    vi.advanceTimersByTime(100);

    const savedData = vi.mocked(options.save).mock.calls[0][0];
    expect(savedData[PROJECT].activeTabId).toBeNull();

    panel.dispose();
  });

  it("persist:true (default) tabs are always saved", async () => {
    vi.useFakeTimers();
    await panel.hydrate();

    panel.openView("terminal");
    panel.openView("editor");

    vi.advanceTimersByTime(100);

    const savedData = vi.mocked(options.save).mock.calls[0][0] as Record<string, any>;
    expect(savedData[PROJECT].tabs).toHaveLength(2);

    panel.dispose();
  });
});
