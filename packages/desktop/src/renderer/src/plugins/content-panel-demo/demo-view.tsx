import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "zustand";
import { useInstanceId, useViewState } from "../../features/content-panel";
import type { ContentPanelStoreState } from "../../features/content-panel";
import { useRendererApp } from "../../core/app";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";

export default function DemoView() {
  const instanceId = useInstanceId();
  const state = useViewState();
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;
  const [counter, setCounter] = useState(0);
  const [hookLog, setHookLog] = useState<string[]>([]);
  const [beforeCloseGuards, setBeforeCloseGuards] = useState(0);
  const guardsRef = useRef(0);

  // Live store snapshot
  const projectPath = useStore(
    contentPanel.store,
    (s: ContentPanelStoreState) => {
      for (const [path, ps] of Object.entries(s.projects)) {
        if (ps.tabs.some((t) => t.id === instanceId)) return path;
      }
      return "";
    },
  );
  const projectState = useStore(
    contentPanel.store,
    (s: ContentPanelStoreState) => s.projects[projectPath],
  );
  const tabCount = projectState?.tabs.length ?? 0;
  const activeTabId = projectState?.activeTabId;
  const currentTab = projectState?.tabs.find((t) => t.id === instanceId);

  const log = useCallback((msg: string) => {
    setHookLog((prev) => [...prev.slice(-49), `${new Date().toLocaleTimeString()} ${msg}`]);
  }, []);

  // Register lifecycle hooks — shows ordering
  useEffect(() => {
    const unhooks = [
      contentPanel.hook("opened", (ctx) =>
        log(`[opened] ${ctx.viewId} ${ctx.instanceId.slice(0, 8)}`)),
      contentPanel.hook("closed", (ctx) =>
        log(`[closed] ${ctx.viewId} ${ctx.instanceId.slice(0, 8)}`)),
      contentPanel.hook("activated", (ctx) =>
        log(`[activated] ${ctx.viewId} ${ctx.instanceId.slice(0, 8)}`)),
      contentPanel.hook("deactivated", (ctx) =>
        log(`[deactivated] ${ctx.viewId} ${ctx.instanceId.slice(0, 8)}`)),
    ];
    return () => unhooks.forEach((fn) => fn());
  }, [contentPanel, log]);

  // Multiple beforeClose guards — tests bailCaller short-circuit
  useEffect(() => {
    if (beforeCloseGuards === 0) return;
    const unhooks: (() => void)[] = [];
    for (let i = 0; i < guardsRef.current; i++) {
      const idx = i;
      unhooks.push(
        contentPanel.onBeforeClose((ctx) => {
          if (ctx.instanceId === instanceId) {
            log(`[beforeClose guard #${idx}] blocked`);
            return false;
          }
          return true;
        }),
      );
    }
    return () => unhooks.forEach((fn) => fn());
  }, [beforeCloseGuards, contentPanel, instanceId, log]);

  // Rapid open/close stress test
  const rapidTest = useCallback(async (count: number) => {
    log(`--- rapid test: ${count} open+close ---`);
    const start = performance.now();
    for (let i = 0; i < count; i++) {
      const id = await contentPanel.openView("demo-multi", {
        name: `Rapid #${i}`,
        activate: false,
      });
      await contentPanel.closeView(id);
    }
    const elapsed = (performance.now() - start).toFixed(1);
    log(`--- rapid test done: ${elapsed}ms ---`);
  }, [contentPanel, log]);

  return (
    <ScrollArea>
      <div className="flex flex-col gap-3 p-4">
        {/* Header */}
        <div>
          <h2 className="text-sm font-medium">Content Panel Demo</h2>
          <p className="text-xs text-muted-foreground">
            Instance: {instanceId.slice(0, 8)}… | Project: {projectPath || "none"}
          </p>
        </div>

        {/* Live Store State */}
        <Section title="Live Store State">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <Kv label="Tab Count" value={tabCount} />
            <Kv label="Active Tab" value={activeTabId?.slice(0, 8) ?? "none"} />
            <Kv label="This Tab" value={currentTab?.name ?? "?"} />
            <Kv label="Is Active" value={String(activeTabId === instanceId)} />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">All tabs:</p>
          <div className="mt-1 space-y-0.5">
            {projectState?.tabs.map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-2 rounded px-2 py-0.5 text-xs font-mono ${
                  t.id === activeTabId ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                } ${t.id === instanceId ? "ring-1 ring-primary/30" : ""}`}
              >
                <span className="truncate">{t.id.slice(0, 8)}</span>
                <span className="text-muted-foreground">·</span>
                <span>{t.viewId}</span>
                <span className="text-muted-foreground">·</span>
                <span className="truncate">{t.name}</span>
              </div>
            )) ?? null}
          </div>
        </Section>

        {/* Tab API */}
        <Section title="Tab API">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm"
              onClick={() => contentPanel.openView("demo-multi", { name: `Multi #${Date.now().toString(36)}` })}>
              Open + Activate
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => contentPanel.openView("demo-multi", { name: `BG #${Date.now().toString(36)}`, activate: false })}>
              Open Background
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => contentPanel.openView("demo-singleton")}>
              Open Singleton
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => contentPanel.updateView(instanceId, { name: `Renamed ${Date.now().toString(36)}` })}>
              Rename This
            </Button>
            <Button variant="destructive-outline" size="sm"
              onClick={() => contentPanel.closeView(instanceId)}>
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
            <Button variant="outline" size="sm"
              onClick={() => contentPanel.updateViewState(instanceId, { clickedAt: new Date().toISOString() })}>
              Write Timestamp
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => contentPanel.updateViewState(instanceId, { random: Math.random().toFixed(4) })}>
              Add Random
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => contentPanel.updateViewState(instanceId, { counter })}>
              Persist Counter
            </Button>
          </div>
        </Section>

        {/* Local State */}
        <Section title="Local State (resets on remount)">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" onClick={() => setCounter((c) => c - 1)}>−</Button>
            <span className="min-w-8 text-center text-sm font-mono">{counter}</span>
            <Button variant="outline" size="icon-sm" onClick={() => setCounter((c) => c + 1)}>+</Button>
          </div>
        </Section>

        {/* beforeClose Guards */}
        <Section title="beforeClose Guards (multi-handler)">
          <p className="mb-2 text-xs text-muted-foreground">
            Each guard blocks close for this tab. Tests bailCaller short-circuit with multiple handlers.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => {
              guardsRef.current += 1;
              setBeforeCloseGuards(guardsRef.current);
            }}>
              Add Guard ({beforeCloseGuards} active)
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              guardsRef.current = 0;
              setBeforeCloseGuards(0);
            }}>
              Remove All
            </Button>
            <span className="text-xs text-muted-foreground">
              {beforeCloseGuards > 0
                ? `${beforeCloseGuards} guard(s) — close is blocked`
                : "No guards — close allowed"}
            </span>
          </div>
        </Section>

        {/* Rapid Test */}
        <Section title="Stress Test (rapid open+close)">
          <p className="mb-2 text-xs text-muted-foreground">
            Opens and immediately closes tabs in a loop. Tests race conditions, hook ordering, and debounce behavior.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => rapidTest(10)}>10x</Button>
            <Button variant="outline" size="sm" onClick={() => rapidTest(50)}>50x</Button>
            <Button variant="outline" size="sm" onClick={() => rapidTest(100)}>100x</Button>
          </div>
        </Section>

        {/* Hook Event Log */}
        <Section title="Hook Event Log">
          <p className="mb-1 text-[10px] text-muted-foreground">
            Shows hook firing order: opened → activated → deactivated → closed → beforeClose
          </p>
          <div className="flex justify-end mb-1">
            <Button variant="ghost" size="xs" onClick={() => setHookLog([])}>Clear</Button>
          </div>
          <div className="rounded bg-muted p-2 font-mono text-[11px] leading-relaxed max-h-60 overflow-y-auto">
            {hookLog.length === 0 ? (
              <span className="text-muted-foreground">No events yet. Interact with tabs to see hooks fire.</span>
            ) : (
              hookLog.map((line, i) => <div key={i}>{line}</div>)
            )}
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
