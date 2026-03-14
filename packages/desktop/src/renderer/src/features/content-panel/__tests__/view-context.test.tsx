import { renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { ContentPanelView } from "../../../core/plugin/contributions";
import type { IWorkbenchLayoutService } from "../../../core/workbench/layout";

import {
  ContentPanelViewContextProvider,
  useContentPanelViewContext,
} from "../components/view-context";
import { ContentPanel } from "../content-panel";

// Mock useRendererApp to return our test contentPanel
let panel: ContentPanel;

vi.mock("../../../core", () => ({
  useRendererApp: () => ({
    workbench: {
      layout: {
        expandPart: vi.fn(),
        collapsePart: vi.fn(),
        togglePart: vi.fn(),
        maximizePart: vi.fn(),
      },
      contentPanel: panel,
    },
  }),
}));

const PROJECT = "/test/project";
const VIEWS: ContentPanelView[] = [
  {
    viewType: "terminal",
    name: "Terminal",
    singleton: false,
    component: () => Promise.resolve({ default: () => null }),
  },
];

beforeEach(() => {
  panel = new ContentPanel({
    views: VIEWS,
    layout: {
      expandPart: vi.fn(),
      collapsePart: vi.fn(),
      togglePart: vi.fn(),
      maximizePart: vi.fn(),
    } satisfies IWorkbenchLayoutService,
    load: async () => ({}),
    save: async () => {},
  });
  panel.setProjectPath(PROJECT);
  panel.store.getState().addTab(PROJECT, {
    id: "tab-1",
    viewType: "terminal",
    name: "Terminal",
    state: { cwd: "/home" },
  });
  panel.store.getState().setActiveTab(PROJECT, "tab-1");
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ContentPanelViewContextProvider viewId="tab-1">{children}</ContentPanelViewContextProvider>
  );
}

describe("useContentPanelViewContext", () => {
  it("returns viewId from context", () => {
    const { result } = renderHook(() => useContentPanelViewContext(), { wrapper });
    expect(result.current.viewId).toBe("tab-1");
  });

  it("returns viewState from store", () => {
    const { result } = renderHook(() => useContentPanelViewContext(), { wrapper });
    expect(result.current.viewState).toEqual({ cwd: "/home" });
  });

  it("returns isActive when tab is active", () => {
    const { result } = renderHook(() => useContentPanelViewContext(), { wrapper });
    expect(result.current.isActive).toBe(true);
  });

  it("returns isActive false when tab is not active", () => {
    panel.store.getState().addTab(PROJECT, {
      id: "tab-2",
      viewType: "terminal",
      name: "Terminal 2",
      state: {},
    });
    panel.store.getState().setActiveTab(PROJECT, "tab-2");

    const { result } = renderHook(() => useContentPanelViewContext(), { wrapper });
    expect(result.current.isActive).toBe(false);
  });

  it("throws outside provider", () => {
    expect(() => renderHook(() => useContentPanelViewContext())).toThrow();
  });
});
