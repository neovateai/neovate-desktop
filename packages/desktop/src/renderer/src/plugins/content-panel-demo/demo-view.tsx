import { useState } from "react";
import { useStore } from "zustand";

import type { ContentPanelStoreState } from "../../features/content-panel";

import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { useRendererApp } from "../../core/app";
import { useContentPanelViewContext } from "../../features/content-panel";

export default function DemoView() {
  const { viewId, viewState: state } = useContentPanelViewContext();
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;
  const [counter, setCounter] = useState(0);

  // Live store snapshot
  const projectPath = useStore(contentPanel.store, (s: ContentPanelStoreState) => {
    for (const [path, ps] of Object.entries(s.projects)) {
      if (ps.tabs.some((t) => t.id === viewId)) return path;
    }
    return "";
  });
  const projectState = useStore(
    contentPanel.store,
    (s: ContentPanelStoreState) => s.projects[projectPath],
  );
  const tabCount = projectState?.tabs.length ?? 0;
  const activeTabId = projectState?.activeTabId;
  const currentTab = projectState?.tabs.find((t) => t.id === viewId);

  return (
    <ScrollArea>
      <div className="flex flex-col gap-3 p-4">
        {/* Header */}
        <div>
          <h2 className="text-sm font-medium">Content Panel Demo</h2>
          <p className="text-xs text-muted-foreground">
            Instance: {viewId.slice(0, 8)}… | Project: {projectPath || "none"}
          </p>
        </div>

        {/* Live Store State */}
        <Section title="Live Store State">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <Kv label="Tab Count" value={tabCount} />
            <Kv label="Active Tab" value={activeTabId?.slice(0, 8) ?? "none"} />
            <Kv label="This Tab" value={currentTab?.viewType ?? "?"} />
            <Kv label="Is Active" value={String(activeTabId === viewId)} />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">All tabs:</p>
          <div className="mt-1 space-y-0.5">
            {projectState?.tabs.map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-2 rounded px-2 py-0.5 text-xs font-mono ${
                  t.id === activeTabId
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                } ${t.id === viewId ? "ring-1 ring-primary/30" : ""}`}
              >
                <span className="truncate">{t.id.slice(0, 8)}</span>
                <span className="text-muted-foreground">·</span>
                <span>{t.viewType}</span>
                <span className="text-muted-foreground">·</span>
                <span className="truncate">{t.viewType}</span>
              </div>
            )) ?? null}
          </div>
        </Section>

        {/* Tab API */}
        <Section title="Tab API">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => contentPanel.openView("demo-multi")}>
              Open + Activate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                contentPanel.openView("demo-multi", {
                  activate: false,
                })
              }
            >
              Open Background
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => contentPanel.openView("demo-singleton")}
            >
              Open Singleton
            </Button>
            <Button
              variant="destructive-outline"
              size="sm"
              onClick={() => contentPanel.closeView(viewId)}
            >
              Close This
            </Button>
          </div>
        </Section>

        {/* Persisted View State */}
        <Section title="Persisted View State (reactive)">
          <pre className="rounded bg-muted p-2 text-xs font-mono whitespace-pre-wrap">
            {JSON.stringify(state, null, 2) || "{}"}
          </pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                contentPanel.updateViewState(viewId, { clickedAt: new Date().toISOString() })
              }
            >
              Write Timestamp
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                contentPanel.updateViewState(viewId, { random: Math.random().toFixed(4) })
              }
            >
              Add Random
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => contentPanel.updateViewState(viewId, { counter })}
            >
              Persist Counter
            </Button>
          </div>
        </Section>

        {/* Local State */}
        <Section title="Local State (resets on remount)">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" onClick={() => setCounter((c) => c - 1)}>
              −
            </Button>
            <span className="min-w-8 text-center text-sm font-mono">{counter}</span>
            <Button variant="outline" size="icon-sm" onClick={() => setCounter((c) => c + 1)}>
              +
            </Button>
          </div>
        </Section>
      </div>
    </ScrollArea>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
