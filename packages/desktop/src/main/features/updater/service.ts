import type { AppUpdater } from "electron-updater";

import { EventPublisher } from "@orpc/server";
import debug from "debug";
import { autoUpdater } from "electron-updater";

import type { IUpdateService, UpdaterState } from "../../../shared/features/updater/types";

const log = debug("neovate:updater");

export type FeedURLOptions = Parameters<AppUpdater["setFeedURL"]>[0];

export interface UpdaterOptions {
  feedURL?: FeedURLOptions | (() => Promise<FeedURLOptions>);
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 30_000;

export class UpdaterService implements IUpdateService {
  private _state: UpdaterState = { status: "idle" };
  readonly publisher = new EventPublisher<{ state: UpdaterState }>();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private checkTimeout: ReturnType<typeof setTimeout> | null = null;
  private installRequested = false;
  private diagnosticsAttached = false;
  private diagnosticCleanups: Array<() => void> = [];
  private lastLoggedProgressBucket = -1;

  // Internal concurrency-control state (not directly exposed to UI)
  private isChecking = false;
  private surfaceUI = false;
  private pendingUpdate: {
    version: string;
    status: "downloading" | "ready";
    percent: number;
  } | null = null;

  get state(): UpdaterState {
    return this._state;
  }

  onStateChange(cb: (state: UpdaterState) => void): () => void {
    return this.publisher.subscribe("state", cb);
  }

  private setState(newState: UpdaterState) {
    log("state transition %O -> %O", this._state, newState);
    this._state = newState;
    this.publisher.publish("state", newState);
  }

  private clearCheckTimeout() {
    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
    }
  }

  private formatError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    return error;
  }

  private logSnapshot(reason: string) {
    const updater = autoUpdater as AppUpdater & {
      quitAndInstallCalled?: boolean;
      squirrelDownloadedUpdate?: boolean;
      downloadedUpdateHelper?: {
        file?: string | null;
        packageFile?: string | null;
      } | null;
      nativeUpdater?: { getFeedURL?: () => string | null };
    };

    log("snapshot:%s %O", reason, {
      state: this._state,
      surfaceUI: this.surfaceUI,
      isChecking: this.isChecking,
      installRequested: this.installRequested,
      pendingUpdate: this.pendingUpdate,
      autoDownload: updater.autoDownload,
      quitAndInstallCalled: updater.quitAndInstallCalled,
      squirrelDownloadedUpdate: updater.squirrelDownloadedUpdate,
      downloadedFile: updater.downloadedUpdateHelper?.file ?? null,
      downloadedPackageFile: updater.downloadedUpdateHelper?.packageFile ?? null,
      nativeFeedURL: updater.nativeUpdater?.getFeedURL?.() ?? null,
    });
  }

  private attachDiagnostics() {
    if (this.diagnosticsAttached) return;
    this.diagnosticsAttached = true;

    this.logSnapshot("attach-diagnostics");

    const nativeUpdater = (
      autoUpdater as AppUpdater & {
        nativeUpdater?: {
          on?: (event: string, listener: (...args: unknown[]) => void) => void;
          removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
        };
      }
    ).nativeUpdater;

    if (!nativeUpdater?.on) {
      log("native updater diagnostics unavailable");
      return;
    }

    const nativeEvents = [
      "error",
      "checking-for-update",
      "update-available",
      "update-not-available",
      "update-downloaded",
      "before-quit-for-update",
    ];

    for (const event of nativeEvents) {
      const handler = (...args: unknown[]) => {
        const details = event === "error" ? args.map((arg) => this.formatError(arg)) : args;
        log("nativeUpdater event:%s %O", event, details);
        this.logSnapshot(`native:${event}`);
      };

      nativeUpdater.on(event, handler);
      this.diagnosticCleanups.push(() => nativeUpdater.removeListener?.(event, handler));
    }
  }

  private shouldSurfaceError(): boolean {
    return (
      this.surfaceUI ||
      this._state.status === "error" ||
      this._state.status === "downloading" ||
      this._state.status === "ready"
    );
  }

  check(manual = false) {
    log("check", { manual });
    // If a download is already in progress or ready, re-surface to UI on manual check
    if (this.pendingUpdate) {
      if (manual) {
        log("re-surface pending update", {
          status: this.pendingUpdate.status,
          version: this.pendingUpdate.version,
        });
        this.surfaceUI = true;
        if (this.pendingUpdate.status === "ready") {
          this.setState({ status: "ready", version: this.pendingUpdate.version });
        } else {
          this.setState({
            status: "downloading",
            version: this.pendingUpdate.version,
            percent: this.pendingUpdate.percent,
          });
        }
      }
      return;
    }

    // If a check is already in flight, let it surface to UI on manual check
    if (this.isChecking) {
      if (manual) {
        log("re-surface in-flight check");
        this.surfaceUI = true;
        this.setState({ status: "checking" });
      }
      return;
    }

    // Start a fresh check
    log("starting fresh check", { manual });
    this.isChecking = true;
    this.surfaceUI = manual;
    if (manual) {
      this.setState({ status: "checking" });
    }
    autoUpdater.checkForUpdates().catch(() => {});
    this.checkTimeout = setTimeout(() => {
      log("check timed out");
      this.checkTimeout = null;
      this.isChecking = false;
      if (this.surfaceUI) {
        this.setState({ status: "error", message: "TIMEOUT" });
      }
    }, CHECK_TIMEOUT_MS);
  }

  install() {
    log("install requested", {
      state: this._state,
      pendingUpdate: this.pendingUpdate,
      installRequested: this.installRequested,
    });
    if (this.pendingUpdate?.status !== "ready" || this.installRequested) {
      this.logSnapshot("install-ignored");
      return;
    }
    this.installRequested = true;
    this.logSnapshot("install-before-quitAndInstall");
    autoUpdater.quitAndInstall();
  }

  async init(options?: UpdaterOptions) {
    log("init", { hasFeedURL: !!options?.feedURL });
    this.attachDiagnostics();
    autoUpdater.autoDownload = false;

    if (options?.feedURL) {
      try {
        const resolved =
          typeof options.feedURL === "function" ? await options.feedURL() : options.feedURL;
        autoUpdater.setFeedURL(resolved);
        log("feed URL set", { feedURL: resolved });
        this.logSnapshot("setFeedURL");
      } catch (err) {
        console.error(
          "[UpdaterService] Failed to resolve feedURL, using build-time config:",
          (err as Error).message,
        );
      }
    }

    autoUpdater.on("update-not-available", () => {
      log("update not available", { surfaceUI: this.surfaceUI });
      this.clearCheckTimeout();
      this.isChecking = false;
      this.installRequested = false;
      this.logSnapshot("update-not-available");
      if (this.surfaceUI || this._state.status === "error") {
        this.setState({ status: "up-to-date" });
      }
    });

    autoUpdater.on("update-available", (info) => {
      log("update available", { version: info.version, surfaceUI: this.surfaceUI });
      this.clearCheckTimeout();
      this.isChecking = false;
      this.installRequested = false;
      this.lastLoggedProgressBucket = -1;
      this.pendingUpdate = { version: info.version, status: "downloading", percent: 0 };
      this.logSnapshot("update-available");
      if (this.surfaceUI || this._state.status === "error") {
        this.setState({ status: "downloading", version: info.version, percent: 0 });
      }
      autoUpdater.downloadUpdate().catch(() => {});
    });

    autoUpdater.on("download-progress", (p) => {
      if (this.pendingUpdate) {
        this.pendingUpdate.percent = Math.round(p.percent);
      }
      const progressBucket = Math.max(0, Math.min(10, Math.floor(p.percent / 10)));
      if (progressBucket !== this.lastLoggedProgressBucket) {
        this.lastLoggedProgressBucket = progressBucket;
        log("download progress %O", {
          version: this.pendingUpdate?.version ?? null,
          percent: Math.round(p.percent),
          transferred: p.transferred,
          total: p.total,
          bytesPerSecond: p.bytesPerSecond,
        });
      }
      if (this.surfaceUI && this.pendingUpdate) {
        this.setState({
          status: "downloading",
          version: this.pendingUpdate.version,
          percent: this.pendingUpdate.percent,
        });
      }
    });

    autoUpdater.on("update-downloaded", (info) => {
      log("update downloaded", { version: info.version });
      if (this.pendingUpdate) {
        this.pendingUpdate.status = "ready";
      }
      this.lastLoggedProgressBucket = -1;
      this.logSnapshot("update-downloaded");
      // Always surface ready — user must see this toast
      this.setState({ status: "ready", version: info.version });
    });

    autoUpdater.on("error", (err) => {
      log("update error %O", this.formatError(err));
      this.clearCheckTimeout();
      this.isChecking = false;
      this.installRequested = false;
      this.lastLoggedProgressBucket = -1;
      this.pendingUpdate = null;
      this.logSnapshot(`error:${err.message}`);
      if (this.shouldSurfaceError()) {
        this.setState({ status: "error", message: err.message });
      }
    });

    this.check();
    this.checkInterval = setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  dispose() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.clearCheckTimeout();
    for (const cleanup of this.diagnosticCleanups.splice(0)) {
      cleanup();
    }
    autoUpdater.removeAllListeners();
  }
}
