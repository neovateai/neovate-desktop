import debug from "debug";
import { enableMapSet } from "immer";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type {
  InspectorState,
  RequestDetail,
  RequestSummary,
} from "../../../../shared/features/agent/request-types";

import { client } from "../../orpc";

const log = debug("neovate:network-store");

enableMapSet();

type MergedRequest = {
  id: string;
  requestState: "in-flight" | "complete" | "error";
  turnIndex: number;
  timestamp: number;
  url: string;
  method: string;
  model?: string;
  isStream?: boolean;
  headers: Record<string, string>;
  messageCount?: number;
  toolNames?: string[];
  maxTokens?: number;
  httpStatus?: number;
  duration?: number;
  stopReason?: string;
  usage?: RequestSummary["usage"];
  contentBlockTypes?: string[];
  error?: string;
};

type NetworkState = {
  requests: Map<string, MergedRequest>;
  requestOrder: string[];
  selectedRequestId: string | null;
  selectedDetail: RequestDetail | null;
  inspectorState: InspectorState;

  onSummary: (summary: RequestSummary) => void;
  selectRequest: (requestId: string | null) => void;
  loadSession: (sessionId: string) => Promise<void>;
  clear: (sessionId: string) => void;
  reset: () => void;
};

function summaryToMerged(summary: RequestSummary, phase: "start" | "end"): MergedRequest {
  const requestState: MergedRequest["requestState"] =
    phase === "start" ? "in-flight" : summary.error ? "error" : "complete";

  return {
    id: summary.id,
    requestState,
    turnIndex: summary.turnIndex,
    timestamp: summary.timestamp,
    url: summary.url,
    method: summary.method,
    model: summary.model,
    isStream: summary.isStream,
    headers: summary.headers,
    messageCount: summary.messageCount,
    toolNames: summary.toolNames,
    maxTokens: summary.maxTokens,
    httpStatus: summary.status,
    duration: summary.duration,
    stopReason: summary.stopReason,
    usage: summary.usage,
    contentBlockTypes: summary.contentBlockTypes,
    error: summary.error,
  };
}

export const useNetworkStore = create<NetworkState>()(
  immer((set, get) => ({
    requests: new Map(),
    requestOrder: [],
    selectedRequestId: null,
    selectedDetail: null,
    inspectorState: "not-enabled",

    onSummary: (summary) => {
      log("onSummary: id=%s phase=%s", summary.id, summary.phase);
      set((state) => {
        const existing = state.requests.get(summary.id);

        if (summary.phase === "start") {
          state.requests.set(summary.id, summaryToMerged(summary, "start"));
          if (!existing) {
            state.requestOrder.push(summary.id);
          }
        } else {
          // "end" phase
          if (existing) {
            // Merge response fields onto existing in-flight request
            existing.requestState = summary.error ? "error" : "complete";
            existing.httpStatus = summary.status;
            existing.duration = summary.duration;
            existing.stopReason = summary.stopReason;
            existing.usage = summary.usage;
            existing.contentBlockTypes = summary.contentBlockTypes;
            existing.error = summary.error;
          } else {
            // No prior start — create complete entry directly
            state.requests.set(summary.id, summaryToMerged(summary, "end"));
            state.requestOrder.push(summary.id);
          }
        }
      });
    },

    selectRequest: async (requestId) => {
      log("selectRequest: %s", requestId);
      set((state) => {
        state.selectedRequestId = requestId;
        if (!requestId) {
          state.selectedDetail = null;
        }
      });

      if (!requestId) return;

      // Fetch detail from main process
      // We need a sessionId — find it from the agent store or pass it through.
      // For now, we use the same pattern as loadSession: the caller provides sessionId
      // via the view component. We'll fetch from the component instead.
    },

    loadSession: async (sessionId) => {
      log("loadSession: %s", sessionId);
      try {
        const [inspectorState, summaries] = await Promise.all([
          client.agent.network.getInspectorState({ sessionId }),
          client.agent.network.listRequests({ sessionId }),
        ]);

        set((state) => {
          state.inspectorState = inspectorState;
          state.requests = new Map();
          state.requestOrder = [];
          state.selectedRequestId = null;
          state.selectedDetail = null;

          // Rebuild from summaries — pair start+end by ID
          const startMap = new Map<string, RequestSummary>();
          for (const s of summaries) {
            if (s.phase === "start") {
              startMap.set(s.id, s);
            }
          }

          const seen = new Set<string>();
          for (const s of summaries) {
            if (seen.has(s.id)) continue;
            seen.add(s.id);

            const start = startMap.get(s.id);
            const end = summaries.find((r) => r.id === s.id && r.phase === "end");

            if (start && end) {
              const merged = summaryToMerged(start, "start");
              merged.requestState = end.error ? "error" : "complete";
              merged.httpStatus = end.status;
              merged.duration = end.duration;
              merged.stopReason = end.stopReason;
              merged.usage = end.usage;
              merged.contentBlockTypes = end.contentBlockTypes;
              merged.error = end.error;
              state.requests.set(s.id, merged);
            } else if (start) {
              state.requests.set(s.id, summaryToMerged(start, "start"));
            } else if (end) {
              state.requests.set(s.id, summaryToMerged(end, "end"));
            }

            state.requestOrder.push(s.id);
          }
        });

        log(
          "loadSession: loaded %d requests, inspector=%s",
          get().requestOrder.length,
          inspectorState,
        );
      } catch (err) {
        log("loadSession: error %o", err);
        set((state) => {
          state.inspectorState = "failed";
        });
      }
    },

    clear: (sessionId) => {
      log("clear: %s", sessionId);
      client.agent.network.clearRequests({ sessionId }).catch((err: unknown) => {
        log("clear: error %o", err);
      });
      set((state) => {
        state.requests = new Map();
        state.requestOrder = [];
        state.selectedRequestId = null;
        state.selectedDetail = null;
      });
    },

    reset: () => {
      log("reset");
      set((state) => {
        state.requests = new Map();
        state.requestOrder = [];
        state.selectedRequestId = null;
        state.selectedDetail = null;
        state.inspectorState = "not-enabled";
      });
    },
  })),
);
