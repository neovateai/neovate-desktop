import debug from "debug";

import type { WeixinMessage } from "./types";

import { getUpdates } from "./api";

const log = debug("neovate:remote-control:wechat:monitor");

const SESSION_EXPIRED_ERRCODE = -14;
const MAX_CONSECUTIVE_FAILURES = 3;
const SESSION_EXPIRY_PAUSE_MS = 10 * 60_000; // 10 min (wechatbot uses 1h; shorter for desktop UX)

export type MonitorExitReason = "aborted" | "relogin";

export type MonitorCallbacks = {
  /** Called for each inbound message that passes protocol-level filters. */
  onMessage: (msg: WeixinMessage) => Promise<void>;
  /** Called when sync cursor updates. */
  onSyncCursor: (cursor: string) => void;
  /** Called on status changes. "resumed" is only emitted after first successful poll post-pause. */
  onStatus: (status: "pausing" | "resumed") => void;
};

/**
 * Abort-aware sleep that rejects on signal abort.
 * Listeners are bounded by AbortController lifecycle (created in adapter.start(),
 * aborted in adapter.stop()) — no leak concern from { once: true } lingering.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

export async function startMonitor(params: {
  baseUrl: string;
  token: string;
  initialSyncCursor: string;
  callbacks: MonitorCallbacks;
  signal: AbortSignal;
}): Promise<MonitorExitReason> {
  const { baseUrl, token, callbacks, signal } = params;
  let syncCursor = params.initialSyncCursor;
  let consecutiveFailures = 0;
  let nextTimeoutMs = 35_000;
  let wasPaused = false;

  log("monitor started (baseUrl=%s)", baseUrl);
  if (syncCursor) {
    log("resuming from saved sync cursor (%d bytes)", syncCursor.length);
  }

  while (!signal.aborted) {
    try {
      const resp = await getUpdates({
        baseUrl,
        token,
        getUpdatesBuf: syncCursor,
        timeoutMs: nextTimeoutMs,
      });

      if (resp.longpolling_timeout_ms && resp.longpolling_timeout_ms > 0) {
        nextTimeoutMs = resp.longpolling_timeout_ms;
      }

      const isApiError =
        (resp.ret !== undefined && resp.ret !== 0) ||
        (resp.errcode !== undefined && resp.errcode !== 0);

      if (isApiError) {
        const isSessionExpired =
          resp.errcode === SESSION_EXPIRED_ERRCODE || resp.ret === SESSION_EXPIRED_ERRCODE;

        if (isSessionExpired) {
          log("session expired (errcode -14), pausing for %dms...", SESSION_EXPIRY_PAUSE_MS);
          callbacks.onStatus("pausing");
          wasPaused = true;
          try {
            await sleep(SESSION_EXPIRY_PAUSE_MS, signal);
          } catch {
            return "aborted";
          }
          consecutiveFailures = 0;
          continue;
        }

        consecutiveFailures++;
        log(
          "getUpdates error: ret=%s errcode=%s errmsg=%s (%d/%d)",
          resp.ret,
          resp.errcode,
          resp.errmsg ?? "",
          consecutiveFailures,
          MAX_CONSECUTIVE_FAILURES,
        );

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          const errMsg = resp.errmsg?.toLowerCase() ?? "";
          if (
            resp.errcode === 401 ||
            resp.errcode === 403 ||
            errMsg.includes("unauthorized") ||
            errMsg.includes("token")
          ) {
            log("persistent auth failure, need re-login");
            return "relogin";
          }
          log("backing off 30s...");
          consecutiveFailures = 0;
          try {
            await sleep(30_000, signal);
          } catch {
            return "aborted";
          }
        } else {
          try {
            await sleep(2_000, signal);
          } catch {
            return "aborted";
          }
        }
        continue;
      }

      // Success
      consecutiveFailures = 0;

      // Emit "resumed" only after first successful poll following a pause
      if (wasPaused) {
        wasPaused = false;
        callbacks.onStatus("resumed");
      }

      if (resp.get_updates_buf) {
        syncCursor = resp.get_updates_buf;
        callbacks.onSyncCursor(syncCursor);
      }

      for (const msg of resp.msgs ?? []) {
        if (!msg.from_user_id) continue;

        try {
          await callbacks.onMessage(msg);
        } catch (err) {
          log("onMessage error: %O", err);
        }
      }
    } catch (err) {
      if (signal.aborted) return "aborted";

      consecutiveFailures++;
      log("getUpdates exception (%d/%d): %O", consecutiveFailures, MAX_CONSECUTIVE_FAILURES, err);

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        consecutiveFailures = 0;
        try {
          await sleep(30_000, signal);
        } catch {
          return "aborted";
        }
      } else {
        try {
          await sleep(2_000, signal);
        } catch {
          return "aborted";
        }
      }
    }
  }

  return "aborted";
}
