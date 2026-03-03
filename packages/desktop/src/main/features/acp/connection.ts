import type { AcpClient } from "acpx";
import { sessionUpdateToEventDrafts, createAcpxEvent } from "acpx";
import type {
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import { EventPublisher } from "@orpc/server";
import debug from "debug";
import type { StreamEvent, LoadSessionResult } from "../../../shared/features/acp/types";

const connLog = debug("neovate:acp-connection");
const preloadLog = debug("neovate:acp-preload");

/** Auto-cancel permission requests after 5 minutes of no UI response. */
export const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

function eventBelongsToSession(event: StreamEvent, sessionId: string): boolean {
  switch (event.type) {
    case "acpx_event":
      return event.event.session_id === sessionId;
    case "user_message":
    case "available_commands":
      return event.sessionId === sessionId;
    case "permission_request":
      return event.data.sessionId === sessionId;
    case "timing":
      return true;
  }
}

async function* filterStreamBySession(
  source: AsyncGenerator<StreamEvent>,
  sessionId: string,
): AsyncGenerator<StreamEvent> {
  try {
    for await (const event of source) {
      if (eventBelongsToSession(event, sessionId)) {
        yield event;
      }
    }
  } finally {
    source.return(undefined);
  }
}

type PendingPermission = {
  resolve: (response: RequestPermissionResponse) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type PreloadedSession = {
  events: StreamEvent[];
  result: LoadSessionResult;
};

export class AcpConnection {
  readonly id: string;
  private _client?: AcpClient;
  private publisher = new EventPublisher<{ session: StreamEvent }>();
  private pendingPermissions = new Map<string, PendingPermission>();
  private requestIdCounter = 0;
  private seq = 0;
  private preloadedSessions = new Map<string, PreloadedSession>();
  private preloadPromises = new Map<string, Promise<void>>();
  private activePreload: string | null = null;
  private commandsBySession = new Map<string, string[]>();

  constructor(id: string) {
    this.id = id;
  }

  get client(): AcpClient {
    if (!this._client) throw new Error("Client not initialized");
    return this._client;
  }

  setClient(client: AcpClient): void {
    this._client = client;
  }

  emitSessionUpdate(notification: SessionNotification): void {
    const update = notification.update;
    const sid = notification.sessionId;
    connLog("[%s] sessionUpdate type=%s sid=%s", this.id, update.sessionUpdate, sid);

    if (update.sessionUpdate === "user_message_chunk" && update.content.type === "text") {
      this.publisher.publish("session", {
        type: "user_message",
        sessionId: sid,
        text: update.content.text,
      });
      return;
    }

    if (update.sessionUpdate === "available_commands_update") {
      const commands = update.availableCommands
        .map((entry: { name: string }) => entry.name)
        .filter((name: string) => typeof name === "string" && name.trim().length > 0);
      connLog("[%s] available_commands_update sid=%s commands=%o", this.id, sid, commands);
      this.commandsBySession.set(sid, commands);
      this.publisher.publish("session", {
        type: "available_commands",
        sessionId: sid,
        commands,
      });
      return;
    }

    const drafts = sessionUpdateToEventDrafts(notification);
    for (const draft of drafts) {
      const event = createAcpxEvent({ sessionId: sid, seq: this.seq++ }, draft);
      this.publisher.publish("session", { type: "acpx_event", event });
    }
  }

  getAvailableCommands(sessionId: string): string[] {
    return this.commandsBySession.get(sessionId) ?? [];
  }

  handlePermissionRequest(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const requestId = String(++this.requestIdCounter);
    return new Promise<RequestPermissionResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingPermissions.delete(requestId);
        resolve({ outcome: { outcome: "cancelled" } });
      }, PERMISSION_TIMEOUT_MS);

      this.pendingPermissions.set(requestId, { resolve, timer });
      this.publisher.publish("session", {
        type: "permission_request",
        requestId,
        data: params,
      });
    });
  }

  resolvePermission(requestId: string, optionId: string): void {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingPermissions.delete(requestId);
    pending.resolve({ outcome: { outcome: "selected", optionId } });
  }

  subscribeSession(sessionId: string, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
    const raw = this.publisher.subscribe("session", { signal });
    return filterStreamBySession(raw, sessionId);
  }

  preloadSession(sessionId: string, cwd?: string): Promise<void> {
    if (!this._client) return Promise.resolve();
    if (this.preloadedSessions.has(sessionId)) return Promise.resolve();
    if (this.preloadPromises.has(sessionId)) return this.preloadPromises.get(sessionId)!;

    const promise = this.doPreload(sessionId, cwd).finally(() => {
      this.preloadPromises.delete(sessionId);
    });
    this.preloadPromises.set(sessionId, promise);
    return promise;
  }

  private async doPreload(sessionId: string, cwd?: string): Promise<void> {
    this.activePreload = sessionId;
    preloadLog("starting preload for session %s", sessionId);

    const done = new AbortController();
    const subscription = this.subscribeSession(sessionId, done.signal);
    const events: StreamEvent[] = [];

    try {
      let loadError: unknown;
      const loadPromise = this._client!.loadSession(sessionId, cwd)
        .then((result) => {
          done.abort("load_done");
          return { sessionId, agentSessionId: result.agentSessionId };
        })
        .catch((error: unknown) => {
          loadError = error;
          done.abort("load_error");
          return undefined;
        });

      try {
        for await (const event of subscription) {
          events.push(event);
        }
      } catch {
        // subscription ends when done is aborted
      } finally {
        subscription.return(undefined);
      }

      const result = await loadPromise;
      if (loadError || !result) {
        preloadLog(
          "preload skipped for session %s (agent rejected, likely empty session): %s",
          sessionId,
          JSON.stringify(loadError),
        );
        return;
      }
      // Only cache if this preload wasn't superseded
      if (this.activePreload === sessionId) {
        this.preloadedSessions.set(sessionId, { events, result });
        preloadLog("cached %d events for session %s", events.length, sessionId);
      }
    } catch (error) {
      preloadLog("preload failed for session %s: %s", sessionId, JSON.stringify(error));
    } finally {
      if (this.activePreload === sessionId) {
        this.activePreload = null;
      }
    }
  }

  async consumePreload(sessionId: string): Promise<PreloadedSession | undefined> {
    const inflight = this.preloadPromises.get(sessionId);
    if (inflight) {
      preloadLog("consumePreload: waiting for in-flight preload of session %s", sessionId);
      await inflight;
    }
    const cached = this.preloadedSessions.get(sessionId);
    if (cached) {
      this.preloadedSessions.delete(sessionId);
      preloadLog("consumed preload for session %s (%d events)", sessionId, cached.events.length);
    }
    return cached;
  }

  dispose(): void {
    for (const [id, pending] of this.pendingPermissions) {
      clearTimeout(pending.timer);
      pending.resolve({ outcome: { outcome: "cancelled" } });
      this.pendingPermissions.delete(id);
    }
  }
}
