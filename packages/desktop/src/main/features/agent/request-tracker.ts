import { EventPublisher } from "@orpc/server";
import debug from "debug";

import type {
  InspectorState,
  InterceptorMessage,
  RequestDetail,
  RequestSummary,
} from "../../../shared/features/agent/request-types";

const log = debug("neovate:request-tracker");

const MAX_ENTRIES = 500;
const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50MB

type SessionData = {
  summaries: RequestSummary[];
  bodies: Map<string, RequestDetail>;
  bodySizes: Map<string, number>;
  totalBodyBytes: number;
};

export class RequestTracker {
  private sessions = new Map<string, SessionData>();
  private currentTurn = new Map<string, number>();
  private inspectorState = new Map<string, InspectorState>();
  readonly eventPublisher = new EventPublisher<Record<string, RequestSummary>>();

  markInspectorEnabled(sessionId: string): void {
    this.inspectorState.set(sessionId, "enabled");
    log("markInspectorEnabled: sessionId=%s", sessionId);
  }

  markInspectorFailed(sessionId: string): void {
    this.inspectorState.set(sessionId, "failed");
    log("markInspectorFailed: sessionId=%s", sessionId);
  }

  getInspectorState(sessionId: string): InspectorState {
    return this.inspectorState.get(sessionId) ?? "not-enabled";
  }

  onMessage(sessionId: string, msg: InterceptorMessage): void {
    const session = this.ensureSession(sessionId);

    const { detail, ...rest } = msg;
    const summary: RequestSummary = {
      ...rest,
      turnIndex: this.currentTurn.get(sessionId) ?? 0,
    };

    log(
      "onMessage: sid=%s phase=%s id=%s model=%s status=%s duration=%s",
      sessionId,
      msg.phase,
      msg.id.slice(0, 8),
      msg.model ?? "-",
      msg.status ?? "-",
      msg.duration != null ? `${msg.duration}ms` : "-",
    );

    session.summaries.push(summary);

    if (detail) {
      const requestDetail: RequestDetail = {
        id: msg.id,
        request: detail.request ?? { headers: {}, rawBody: "" },
        response: detail.response,
      };

      const byteSize =
        (detail.request?.rawBody?.length ?? 0) +
        (detail.response
          ? typeof detail.response.body === "string"
            ? detail.response.body.length
            : JSON.stringify(detail.response.body ?? "").length
          : 0);

      session.bodies.set(msg.id, requestDetail);
      session.bodySizes.set(msg.id, byteSize);
      session.totalBodyBytes += byteSize;
    }

    // Dual-cap eviction
    let evictedCount = 0;
    while (session.summaries.length > MAX_ENTRIES || session.totalBodyBytes > MAX_BODY_BYTES) {
      const evicted = session.summaries.shift()!;
      const evictedSize = session.bodySizes.get(evicted.id) ?? 0;
      session.totalBodyBytes -= evictedSize;
      session.bodySizes.delete(evicted.id);
      session.bodies.delete(evicted.id);
      evictedCount++;
    }
    if (evictedCount > 0) {
      log(
        "eviction: sid=%s evicted=%d remaining=%d bodyBytes=%d",
        sessionId,
        evictedCount,
        session.summaries.length,
        session.totalBodyBytes,
      );
    }

    this.eventPublisher.publish(sessionId, summary);
  }

  startTurn(sessionId: string): void {
    const next = (this.currentTurn.get(sessionId) ?? 0) + 1;
    this.currentTurn.set(sessionId, next);
    log("startTurn: sid=%s turn=%d", sessionId, next);
  }

  getRequests(sessionId: string): RequestSummary[] {
    return this.sessions.get(sessionId)?.summaries ?? [];
  }

  getRequestDetail(sessionId: string, requestId: string): RequestDetail | null {
    return this.sessions.get(sessionId)?.bodies.get(requestId) ?? null;
  }

  clearRequests(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.summaries = [];
      session.bodies.clear();
      session.bodySizes.clear();
      session.totalBodyBytes = 0;
      log("clearRequests: sessionId=%s", sessionId);
    }
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.currentTurn.delete(sessionId);
    this.inspectorState.delete(sessionId);
    log("clearSession: sessionId=%s", sessionId);
  }

  private ensureSession(sessionId: string): SessionData {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        summaries: [],
        bodies: new Map(),
        bodySizes: new Map(),
        totalBodyBytes: 0,
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }
}
