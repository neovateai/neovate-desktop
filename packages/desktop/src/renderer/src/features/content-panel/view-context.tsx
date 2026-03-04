import { createContext, useContext, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";
import type { ContentPanelStoreState } from "./types";

interface ViewContextValue {
  store: StoreApi<ContentPanelStoreState>;
  instanceId: string;
  projectPath: string;
}

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewContextProvider({
  store,
  instanceId,
  projectPath,
  children,
}: {
  store: StoreApi<ContentPanelStoreState>;
  instanceId: string;
  projectPath: string;
  children: ReactNode;
}) {
  return (
    <ViewContext.Provider value={{ store, instanceId, projectPath }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useInstanceId(): string {
  const context = useContext(ViewContext);
  if (!context)
    throw new Error("useInstanceId must be used within ViewContextProvider");
  return context.instanceId;
}

export function useViewState(): Record<string, unknown> {
  const context = useContext(ViewContext);
  if (!context)
    throw new Error("useViewState must be used within ViewContextProvider");
  return useStore(
    context.store,
    (s) => s.getTab(context.projectPath, context.instanceId)?.state ?? {},
  );
}
