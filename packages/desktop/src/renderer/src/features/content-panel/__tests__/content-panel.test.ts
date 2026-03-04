import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContentPanel } from "../content-panel";
import type { ContentPanelOptions } from "../content-panel";
import type { ContentPanelView } from "../../../core/plugin/contributions";

const PROJECT = "/test/project";

const VIEWS: ContentPanelView[] = [
  {
    id: "terminal",
    name: "Terminal",
    singleton: false,
    component: () => Promise.resolve({ default: () => null }),
  },
  {
    id: "editor",
    name: "Editor",
    component: () => Promise.resolve({ default: () => null }),
  }, // singleton defaults to true
];

function makeOptions(overrides?: Partial<ContentPanelOptions>): ContentPanelOptions {
  return {
    views: VIEWS,
    load: vi.fn(() => Promise.resolve({})),
    save: vi.fn(() => Promise.resolve()),
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
  it("returns an instanceId and adds tab to store", async () => {
    const id = await panel.openView("terminal");
    expect(id).toBeTruthy();
    expect(
      panel.store.getState().getProjectState(PROJECT).tabs,
    ).toHaveLength(1);
  });

  it("uses view name as default tab name", async () => {
    await panel.openView("terminal");
    expect(
      panel.store.getState().getProjectState(PROJECT).tabs[0].name,
    ).toBe("Terminal");
  });

  it("accepts custom name and props", async () => {
    await panel.openView("terminal", {
      name: "My Term",
      props: { cwd: "/tmp" },
    });
    const tab = panel.store.getState().getProjectState(PROJECT).tabs[0];
    expect(tab.name).toBe("My Term");
  });

  it("fires opened hook with object context", async () => {
    const handler = vi.fn();
    panel.hook("opened", handler);
    const id = await panel.openView("terminal", { props: { cwd: "/tmp" } });
    expect(handler).toHaveBeenCalledWith({
      viewId: "terminal",
      instanceId: id,
      props: { cwd: "/tmp" },
    });
  });

  it("enforces singleton — activates existing instead of creating new", async () => {
    const id1 = await panel.openView("editor");
    const id2 = await panel.openView("editor");
    expect(id1).toBe(id2);
    expect(
      panel.store.getState().getProjectState(PROJECT).tabs,
    ).toHaveLength(1);
  });

  it("allows multiple instances for non-singleton views", async () => {
    const id1 = await panel.openView("terminal");
    const id2 = await panel.openView("terminal");
    expect(id1).not.toBe(id2);
    expect(
      panel.store.getState().getProjectState(PROJECT).tabs,
    ).toHaveLength(2);
  });

  it("throws for unknown viewId", async () => {
    await expect(panel.openView("unknown")).rejects.toThrow();
  });

  it("opens tab without activating when activate: false", async () => {
    const id1 = await panel.openView("terminal");
    const id2 = await panel.openView("terminal", { activate: false });
    expect(panel.store.getState().getProjectState(PROJECT).tabs).toHaveLength(2);
    // id1 remains active
    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBe(id1);
    expect(id2).not.toBe(id1);
  });
});

describe("closeView", () => {
  it("removes the tab and fires closed hook", async () => {
    const handler = vi.fn();
    panel.hook("closed", handler);
    const id = await panel.openView("terminal");
    await panel.closeView(id);
    expect(
      panel.store.getState().getProjectState(PROJECT).tabs,
    ).toHaveLength(0);
    expect(handler).toHaveBeenCalledWith({
      viewId: "terminal",
      instanceId: id,
    });
  });

  it("respects beforeClose returning false", async () => {
    panel.onBeforeClose(() => false);
    const id = await panel.openView("terminal");
    await panel.closeView(id);
    expect(
      panel.store.getState().getProjectState(PROJECT).tabs,
    ).toHaveLength(1);
  });

  it("closes when beforeClose returns true", async () => {
    panel.onBeforeClose(() => true);
    const id = await panel.openView("terminal");
    await panel.closeView(id);
    expect(
      panel.store.getState().getProjectState(PROJECT).tabs,
    ).toHaveLength(0);
  });

  it("closing active tab activates previous tab", async () => {
    await panel.openView("terminal");
    const id2 = await panel.openView("terminal");
    const id3 = await panel.openView("terminal");
    // id3 is active
    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBe(id3);

    await panel.closeView(id3);
    // should fall back to id2 (previous by position)
    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBe(id2);
  });

  it("closing active tab activates first tab when no previous", async () => {
    const id1 = await panel.openView("terminal");
    const id2 = await panel.openView("terminal");
    panel.activateView(id1);

    await panel.closeView(id1);
    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBe(id2);
  });

  it("closing inactive tab preserves active", async () => {
    const id1 = await panel.openView("terminal");
    const id2 = await panel.openView("terminal");
    // id2 is active
    await panel.closeView(id1);
    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBe(id2);
  });

  it("closing last tab sets activeTabId to null", async () => {
    const id = await panel.openView("terminal");
    await panel.closeView(id);
    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBeNull();
  });

  it("multiple beforeClose guards — first false short-circuits", async () => {
    const order: string[] = [];
    panel.onBeforeClose(() => { order.push("guard1"); return false; });
    panel.onBeforeClose(() => { order.push("guard2"); return true; });
    const id = await panel.openView("terminal");
    await panel.closeView(id);
    expect(panel.store.getState().getProjectState(PROJECT).tabs).toHaveLength(1);
    expect(order).toEqual(["guard1"]); // guard2 never called
  });
});

describe("activateView", () => {
  it("sets activeTabId and fires hooks", async () => {
    const deactivated = vi.fn();
    const activated = vi.fn();
    panel.hook("deactivated", deactivated);
    panel.hook("activated", activated);

    const id1 = await panel.openView("terminal");
    const id2 = await panel.openView("terminal");
    panel.activateView(id1);

    expect(panel.store.getState().getProjectState(PROJECT).activeTabId).toBe(
      id1,
    );
    expect(deactivated).toHaveBeenCalledWith({
      viewId: "terminal",
      instanceId: id2,
    });
    expect(activated).toHaveBeenCalledWith({
      viewId: "terminal",
      instanceId: id1,
    });
  });

  it("fires deactivated before activated (ordering)", async () => {
    const order: string[] = [];
    panel.hook("deactivated", () => order.push("deactivated"));
    panel.hook("activated", () => order.push("activated"));

    await panel.openView("terminal");
    await panel.openView("terminal");
    order.length = 0; // reset
    panel.activateView(
      panel.store.getState().getProjectState(PROJECT).tabs[0].id,
    );
    expect(order).toEqual(["deactivated", "activated"]);
  });
});

describe("updateView", () => {
  it("updates tab name via store", async () => {
    const id = await panel.openView("terminal");
    panel.updateView(id, { name: "Renamed" });
    const tab = panel.store.getState().getTab(PROJECT, id);
    expect(tab?.name).toBe("Renamed");
  });
});

describe("getViewState / updateViewState", () => {
  it("reads and writes tab.state", async () => {
    const id = await panel.openView("terminal");
    panel.updateViewState(id, { cwd: "/foo" });
    expect(panel.getViewState(id)).toEqual({ cwd: "/foo" });
  });

  it("shallow merges state", async () => {
    const id = await panel.openView("terminal");
    panel.updateViewState(id, { cwd: "/foo" });
    panel.updateViewState(id, { env: "prod" });
    expect(panel.getViewState(id)).toEqual({ cwd: "/foo", env: "prod" });
  });
});

describe("registeredViewIds", () => {
  it("returns set of registered view IDs", () => {
    expect(panel.registeredViewIds).toEqual(new Set(["terminal", "editor"]));
  });
});

// --- Persistence ---

describe("hydrate", () => {
  it("restores projects state from persistence", async () => {
    const saved = {
      [PROJECT]: {
        tabs: [{ id: "t1", viewId: "terminal", name: "Term", state: {} }],
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
    await panel.openView("terminal");

    vi.useFakeTimers();
    await panel.openView("terminal");
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

    await panel.openView("terminal");
    await panel.openView("terminal");

    // Not saved yet (debounced)
    expect(options.save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(options.save).toHaveBeenCalledTimes(1);
    expect(options.save).toHaveBeenCalledWith(
      panel.store.getState().projects,
    );

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

    await panel.openView("terminal");
    // Timer pending, not yet flushed
    expect(options.save).not.toHaveBeenCalled();

    panel.dispose();
    expect(options.save).toHaveBeenCalledTimes(1);
  });

  it("dispose stops further saves", async () => {
    vi.useFakeTimers();
    await panel.hydrate();
    panel.dispose();

    await panel.openView("terminal");
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

    await p.openView("terminal");
    vi.advanceTimersByTime(100);

    // Let the rejected promise propagate
    await vi.advanceTimersByTimeAsync(0);

    expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
    consoleSpy.mockRestore();
    p.dispose();
  });
});
