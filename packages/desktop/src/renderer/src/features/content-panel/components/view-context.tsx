import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";

import type { ContentPanelStoreState } from "../types";

import { useRendererApp } from "../../../core";

const ViewIdContext = createContext<string | null>(null);

export function ContentPanelViewContextProvider({
  viewId,
  children,
}: {
  viewId: string;
  children: ReactNode;
}) {
  return <ViewIdContext.Provider value={viewId}>{children}</ViewIdContext.Provider>;
}

export interface ContentPanelViewContextValue {
  viewId: string;
  viewState: Record<string, unknown>;
  isActive: boolean;
}

const EMPTY_STATE: Record<string, unknown> = {};

export function useContentPanelViewContext(): ContentPanelViewContextValue {
  const viewId = useContext(ViewIdContext);
  if (!viewId)
    throw new Error(
      "useContentPanelViewContext must be used within ContentPanelViewContextProvider",
    );

  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;

  const viewState = useStore(contentPanel.store, (s: ContentPanelStoreState) => {
    for (const [, ps] of Object.entries(s.projects)) {
      const tab = ps.tabs.find((t) => t.id === viewId);
      if (tab) return tab.state;
    }
    return EMPTY_STATE;
  });

  const isActive = useStore(contentPanel.store, (s: ContentPanelStoreState) => {
    for (const [, ps] of Object.entries(s.projects)) {
      const tab = ps.tabs.find((t) => t.id === viewId);
      if (tab) return ps.activeTabId === viewId;
    }
    return false;
  });

  return { viewId, viewState, isActive };
}
