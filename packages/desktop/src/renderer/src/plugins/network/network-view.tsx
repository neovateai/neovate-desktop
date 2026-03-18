import { useCallback, useEffect, useState } from "react";

import type { RequestDetail } from "../../../../shared/features/agent/request-types";

import { useAgentStore } from "../../features/agent/store";
import { client } from "../../orpc";
import { useNetworkStore } from "./store";

type DetailTab = "headers" | "request" | "response";

export default function NetworkView() {
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const inspectorState = useNetworkStore((s) => s.inspectorState);
  const requestOrder = useNetworkStore((s) => s.requestOrder);
  const requests = useNetworkStore((s) => s.requests);
  const selectedRequestId = useNetworkStore((s) => s.selectedRequestId);
  const selectedDetail = useNetworkStore((s) => s.selectedDetail);
  const loadSession = useNetworkStore((s) => s.loadSession);
  const onSummary = useNetworkStore((s) => s.onSummary);
  const selectRequest = useNetworkStore((s) => s.selectRequest);
  const clear = useNetworkStore((s) => s.clear);
  const reset = useNetworkStore((s) => s.reset);

  const [activeTab, setActiveTab] = useState<DetailTab>("headers");

  // Load session data on mount / session change
  useEffect(() => {
    if (!activeSessionId) {
      reset();
      return;
    }
    loadSession(activeSessionId);
  }, [activeSessionId, loadSession, reset]);

  // Subscribe to live updates
  useEffect(() => {
    if (!activeSessionId) return;

    let cancelled = false;

    async function subscribe() {
      try {
        const iter = await client.agent.network.subscribe({ sessionId: activeSessionId! });
        for await (const summary of iter) {
          if (cancelled) break;
          onSummary(summary);
        }
      } catch {
        // Stream closed or session ended — expected
      }
    }

    subscribe();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, onSummary]);

  // Fetch detail when selection changes
  useEffect(() => {
    if (!activeSessionId || !selectedRequestId) return;

    let cancelled = false;

    async function fetchDetail() {
      try {
        const detail = await client.agent.network.getRequestDetail({
          sessionId: activeSessionId!,
          requestId: selectedRequestId!,
        });
        if (!cancelled) {
          useNetworkStore.setState({ selectedDetail: detail });
        }
      } catch {
        // ignore
      }
    }

    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, selectedRequestId]);

  const handleClear = useCallback(() => {
    if (activeSessionId) clear(activeSessionId);
  }, [activeSessionId, clear]);

  // No session
  if (!activeSessionId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No active session
      </div>
    );
  }

  // Inspector not enabled
  if (inspectorState === "not-enabled") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <p>Network inspector is not enabled for this session.</p>
        <p className="text-xs">Enable it in chat settings to capture API requests.</p>
      </div>
    );
  }

  // Inspector failed
  if (inspectorState === "failed") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <p>Network inspector failed to initialize.</p>
        <p className="text-xs">Check the debug console for details.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="text-xs font-medium text-muted-foreground">
          {requestOrder.length} request{requestOrder.length !== 1 ? "s" : ""}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleClear}
          className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Main split */}
      <div className="flex flex-1 min-h-0">
        {/* Request list */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-border">
          {requestOrder.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Waiting for requests...
            </div>
          ) : (
            <div className="flex flex-col">
              {requestOrder.map((id) => {
                const req = requests.get(id);
                if (!req) return null;
                const isSelected = id === selectedRequestId;

                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectRequest(id)}
                    className={`flex flex-col gap-0.5 px-3 py-2 text-left text-xs border-b border-border transition-colors ${
                      isSelected
                        ? "bg-[#fa216e]/10 border-l-2 border-l-[#fa216e]"
                        : "hover:bg-muted border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <RequestStatusBadge state={req.requestState} />
                      <span className="font-mono font-medium truncate">{req.method}</span>
                      {req.httpStatus != null && (
                        <span
                          className={`font-mono ${
                            req.httpStatus >= 400
                              ? "text-red-500"
                              : "text-green-600 dark:text-green-400"
                          }`}
                        >
                          {req.httpStatus}
                        </span>
                      )}
                      {req.duration != null && (
                        <span className="ml-auto text-muted-foreground">
                          {formatDuration(req.duration)}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-muted-foreground truncate">
                      {formatUrl(req.url)}
                    </span>
                    {req.model && (
                      <span className="text-muted-foreground truncate">{req.model}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          {selectedRequestId && selectedDetail ? (
            <DetailPanel
              detail={selectedDetail}
              request={requests.get(selectedRequestId) ?? null}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : selectedRequestId ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Loading...
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Select a request to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────

type MergedRequest =
  ReturnType<typeof useNetworkStore.getState>["requests"] extends Map<string, infer V> ? V : never;

function DetailPanel({
  detail,
  request,
  activeTab,
  onTabChange,
}: {
  detail: RequestDetail;
  request: MergedRequest | null;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
}) {
  const tabs: { id: DetailTab; label: string }[] = [
    { id: "headers", label: "Headers" },
    { id: "request", label: "Request" },
    { id: "response", label: "Response" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex h-9 shrink-0 items-center gap-0 border-b border-border px-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "text-[#fa216e] border-b-2 border-[#fa216e]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {activeTab === "headers" && <HeadersTab detail={detail} request={request} />}
        {activeTab === "request" && <RequestTab detail={detail} />}
        {activeTab === "response" && <ResponseTab detail={detail} />}
      </div>
    </div>
  );
}

// ─── Headers Tab ─────────────────────────────────────────────────────

function HeadersTab({ detail, request }: { detail: RequestDetail; request: MergedRequest | null }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      {request && (
        <div className="flex flex-col gap-1">
          <SectionTitle>General</SectionTitle>
          <div className="rounded border border-border">
            <HeaderRow label="URL" value={request.url} />
            <HeaderRow label="Method" value={request.method} />
            {request.httpStatus != null && (
              <HeaderRow label="Status" value={String(request.httpStatus)} />
            )}
            {request.model && <HeaderRow label="Model" value={request.model} />}
            {request.duration != null && (
              <HeaderRow label="Duration" value={formatDuration(request.duration)} />
            )}
            {request.stopReason && <HeaderRow label="Stop Reason" value={request.stopReason} />}
            {request.usage && (
              <>
                <HeaderRow
                  label="Input Tokens"
                  value={request.usage.inputTokens.toLocaleString()}
                />
                <HeaderRow
                  label="Output Tokens"
                  value={request.usage.outputTokens.toLocaleString()}
                />
                {request.usage.cacheReadInputTokens != null && (
                  <HeaderRow
                    label="Cache Read"
                    value={request.usage.cacheReadInputTokens.toLocaleString()}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Request headers */}
      <div className="flex flex-col gap-1">
        <SectionTitle>Request Headers</SectionTitle>
        <div className="rounded border border-border">
          {Object.entries(detail.request.headers).length > 0 ? (
            Object.entries(detail.request.headers).map(([key, value]) => (
              <HeaderRow key={key} label={key} value={value} />
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-muted-foreground">No headers</div>
          )}
        </div>
      </div>

      {/* Response headers */}
      {detail.response && (
        <div className="flex flex-col gap-1">
          <SectionTitle>Response Headers</SectionTitle>
          <div className="rounded border border-border">
            {Object.entries(detail.response.headers).length > 0 ? (
              Object.entries(detail.response.headers).map(([key, value]) => (
                <HeaderRow key={key} label={key} value={value} />
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">No headers</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Request Tab ─────────────────────────────────────────────────────

function RequestTab({ detail }: { detail: RequestDetail }) {
  const body = detail.request.rawBody;
  const formatted = tryFormatJson(body);

  return (
    <div className="flex flex-col gap-1">
      <SectionTitle>Request Body</SectionTitle>
      <pre className="rounded border border-border bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap break-all overflow-x-auto">
        {formatted}
      </pre>
    </div>
  );
}

// ─── Response Tab ────────────────────────────────────────────────────

function ResponseTab({ detail }: { detail: RequestDetail }) {
  if (!detail.response) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        No response data available
      </div>
    );
  }

  const body = detail.response.body;
  const formatted = typeof body === "string" ? tryFormatJson(body) : JSON.stringify(body, null, 2);

  return (
    <div className="flex flex-col gap-1">
      <SectionTitle>Response Body</SectionTitle>
      <pre className="rounded border border-border bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap break-all overflow-x-auto">
        {formatted}
      </pre>
    </div>
  );
}

// ─── Shared Components ───────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium text-muted-foreground">{children}</h3>;
}

function HeaderRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex border-b border-border last:border-b-0 px-3 py-1.5 text-xs">
      <span className="w-40 shrink-0 font-mono font-medium text-foreground">{label}</span>
      <span className="font-mono text-muted-foreground break-all">{value}</span>
    </div>
  );
}

function RequestStatusBadge({ state }: { state: "in-flight" | "complete" | "error" }) {
  if (state === "in-flight") {
    return <span className="inline-block size-2 rounded-full bg-blue-500 animate-pulse" />;
  }
  if (state === "error") {
    return <span className="inline-block size-2 rounded-full bg-red-500" />;
  }
  return <span className="inline-block size-2 rounded-full bg-green-500" />;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function tryFormatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
