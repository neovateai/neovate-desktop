import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContentPanel } from "../content-panel";
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

let panel: ContentPanel;

beforeEach(() => {
  panel = new ContentPanel(VIEWS);
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

// --- Persistence ---

function makePersistence() {
  const data = new Map<string, unknown>();
  return {
    load: vi.fn((key: string) => Promise.resolve(data.get(key) ?? null)),
    save: vi.fn((key: string, value: unknown) => {
      data.set(key, value);
      return Promise.resolve();
    }),
    data,
  };
}

describe("hydrate", () => {
  it("restores projects state from persistence", async () => {
    const persistence = makePersistence();
    const saved = {
      [PROJECT]: {
        tabs: [{ id: "t1", viewId: "terminal", name: "Term", state: {} }],
        activeTabId: "t1",
      },
    };
    persistence.data.set("contentPanel", saved);

    await panel.hydrate(persistence);

    const state = panel.store.getState().getProjectState(PROJECT);
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].id).toBe("t1");
    expect(state.activeTabId).toBe("t1");
  });

  it("does nothing when persistence returns null", async () => {
    const persistence = makePersistence();
    await panel.hydrate(persistence);
    expect(panel.store.getState().getProjectState(PROJECT).tabs).toHaveLength(0);
  });
});

describe("persist", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces saves on store changes", async () => {
    vi.useFakeTimers();
    const persistence = makePersistence();
    const unsub = panel.persist(persistence);

    await panel.openView("terminal");
    await panel.openView("terminal");

    // Not saved yet (debounced)
    expect(persistence.save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(persistence.save).toHaveBeenCalledTimes(1);
    expect(persistence.save).toHaveBeenCalledWith(
      "contentPanel",
      panel.store.getState().projects,
    );

    unsub();
  });

  it("unsubscribe stops further saves", async () => {
    vi.useFakeTimers();
    const persistence = makePersistence();
    const unsub = panel.persist(persistence);

    unsub();

    await panel.openView("terminal");
    vi.advanceTimersByTime(200);

    expect(persistence.save).not.toHaveBeenCalled();
  });
});
