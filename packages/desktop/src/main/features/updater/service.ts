import type { AppUpdater } from "electron-updater";

import { EventPublisher } from "@orpc/server";
import debug from "debug";
import { autoUpdater } from "electron-updater";

import type { UpdaterState } from "../../../shared/features/updater/types";

const log = debug("neovate:updater");

export type FeedURLOptions = Parameters<AppUpdater["setFeedURL"]>[0];

export interface UpdaterOptions {
  feedURL?: FeedURLOptions | (() => Promise<FeedURLOptions>);
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export class UpdaterService {
  private state: UpdaterState = { status: "idle" };
  readonly publisher = new EventPublisher<{ state: UpdaterState }>();
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  // Internal concurrency-control state (not directly exposed to UI)
  private isChecking = false;
  private surfaceUI = false;
  private pendingUpdate: {
    version: string;
    status: "downloading" | "ready";
    percent: number;
  } | null = null;

  getState(): UpdaterState {
    return this.state;
  }

  private setState(newState: UpdaterState) {
    this.state = newState;
    this.publisher.publish("state", newState);
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
  }

  install() {
    log("install requested", { status: this.state.status });
    if (this.state.status !== "ready") {
      return;
    }
    autoUpdater.quitAndInstall();
  }

  async init(options?: UpdaterOptions) {
    log("init", { hasFeedURL: !!options?.feedURL });
    autoUpdater.autoDownload = false;

    if (options?.feedURL) {
      try {
        const resolved =
          typeof options.feedURL === "function" ? await options.feedURL() : options.feedURL;
        autoUpdater.setFeedURL(resolved);
        log("feed URL set", { feedURL: resolved });
      } catch (err) {
        console.error(
          "[UpdaterService] Failed to resolve feedURL, using build-time config:",
          (err as Error).message,
        );
      }
    }

    autoUpdater.on("update-not-available", () => {
      log("update not available", { surfaceUI: this.surfaceUI });
      this.isChecking = false;
      if (this.surfaceUI) {
        this.setState({ status: "up-to-date" });
      }
    });

    autoUpdater.on("update-available", (info) => {
      log("update available", { version: info.version, surfaceUI: this.surfaceUI });
      this.isChecking = false;
      this.pendingUpdate = { version: info.version, status: "downloading", percent: 0 };
      if (this.surfaceUI) {
        this.setState({ status: "downloading", version: info.version, percent: 0 });
      }
      autoUpdater.downloadUpdate().catch(() => {});
    });

    autoUpdater.on("download-progress", (p) => {
      if (this.pendingUpdate) {
        this.pendingUpdate.percent = Math.round(p.percent);
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
      // Always surface ready — user must see this toast
      this.setState({ status: "ready", version: info.version });
    });

    autoUpdater.on("error", (err) => {
      log("update error", { message: err.message });
      this.isChecking = false;
      this.pendingUpdate = null;
      if (this.surfaceUI) {
        this.setState({ status: "error", message: err.message });
      }
    });

    this.check();
    this.checkInterval = setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  dispose() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    autoUpdater.removeAllListeners();
  }
}
