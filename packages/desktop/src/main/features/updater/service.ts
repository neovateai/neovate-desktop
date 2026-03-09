import { autoUpdater } from "electron-updater";
import type { IBrowserWindowManager } from "../../core/types";
import type { UpdaterState } from "../../../shared/features/updater/types";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export class UpdaterService {
  constructor(private readonly windowManager: IBrowserWindowManager) {}

  private state: UpdaterState = { status: "idle" };
  private listeners = new Set<(state: UpdaterState) => void>();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private currentVersion: string | null = null;

  getState(): UpdaterState {
    return this.state;
  }

  private setState(newState: UpdaterState) {
    this.state = newState;
    for (const listener of this.listeners) listener(newState);
  }

  async *watchState(signal?: AbortSignal): AsyncGenerator<UpdaterState> {
    const queue: UpdaterState[] = [];
    let resolve: (() => void) | null = null;
    const listener = (s: UpdaterState) => {
      queue.push(s);
      resolve?.();
    };
    this.listeners.add(listener);
    signal?.addEventListener("abort", () => resolve?.(), { once: true });

    try {
      yield this.state;
      while (!signal?.aborted) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
          resolve = null;
        }
      }
    } finally {
      this.listeners.delete(listener);
    }
  }

  check() {
    if (
      this.state.status === "checking" ||
      this.state.status === "downloading" ||
      this.state.status === "ready" ||
      this.state.status === "available"
    ) {
      return;
    }
    this.setState({ status: "checking" });
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      this.setState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

  install() {
    if (this.state.status !== "ready") {
      return;
    }
    this.windowManager.setAutoUpdateQuiting(true);
    autoUpdater.quitAndInstall();
  }

  init() {
    autoUpdater.autoDownload = false;

    autoUpdater.on("update-not-available", () => {
      this.setState({ status: "idle" });
    });

    autoUpdater.on("update-available", (info) => {
      this.currentVersion = info.version;
      this.setState({ status: "available", version: info.version });
      autoUpdater.downloadUpdate();
    });

    autoUpdater.on("download-progress", (p) => {
      if (
        this.currentVersion &&
        (this.state.status === "available" || this.state.status === "downloading")
      ) {
        this.setState({
          status: "downloading",
          version: this.currentVersion,
          percent: Math.round(p.percent),
        });
      }
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.setState({ status: "ready", version: info.version });
    });

    autoUpdater.on("error", (err) => {
      this.setState({ status: "error", message: err.message });
    });

    this.check();
    this.checkInterval = setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  dispose() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.listeners.clear();
    autoUpdater.removeAllListeners();
  }
}
