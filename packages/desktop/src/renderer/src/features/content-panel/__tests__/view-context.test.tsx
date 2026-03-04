// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import {
  ViewContextProvider,
  useInstanceId,
  useViewState,
} from "../components/view-context";
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
];

let panel: ContentPanel;

beforeEach(() => {
  panel = new ContentPanel({
    views: VIEWS,
    load: async () => ({}),
    save: async () => {},
  });
  panel.setProjectPath(PROJECT);
  panel.store.getState().addTab(PROJECT, {
    id: "tab-1",
    viewId: "terminal",
    name: "Terminal",
    state: { cwd: "/home" },
  });
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ViewContextProvider
      store={panel.store}
      instanceId="tab-1"
      projectPath={PROJECT}
    >
      {children}
    </ViewContextProvider>
  );
}

describe("useInstanceId", () => {
  it("returns the instance id from context", () => {
    const { result } = renderHook(() => useInstanceId(), { wrapper });
    expect(result.current).toBe("tab-1");
  });

  it("throws outside provider", () => {
    expect(() => renderHook(() => useInstanceId())).toThrow();
  });
});

describe("useViewState", () => {
  it("returns the tab state from store", () => {
    const { result } = renderHook(() => useViewState(), { wrapper });
    expect(result.current).toEqual({ cwd: "/home" });
  });
});
