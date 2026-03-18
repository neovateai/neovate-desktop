import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAutoUpdater } = vi.hoisted(() => ({
  mockAutoUpdater: (() => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

    return {
      autoDownload: true,
      checkForUpdates: vi.fn().mockResolvedValue(undefined),
      downloadUpdate: vi.fn().mockResolvedValue(undefined),
      quitAndInstall: vi.fn(),
      setFeedURL: vi.fn(),
      on(event: string, listener: (...args: unknown[]) => void) {
        const bucket = listeners.get(event) ?? new Set();
        bucket.add(listener);
        listeners.set(event, bucket);
        return this;
      },
      removeAllListeners() {
        listeners.clear();
        return this;
      },
      emit(event: string, ...args: unknown[]) {
        for (const listener of listeners.get(event) ?? []) {
          listener(...args);
        }
        return true;
      },
    };
  })(),
}));

vi.mock("electron-updater", () => ({
  autoUpdater: mockAutoUpdater,
}));

import { UpdaterService } from "../service";

describe("UpdaterService", () => {
  beforeEach(() => {
    mockAutoUpdater.removeAllListeners();
    mockAutoUpdater.autoDownload = true;
    mockAutoUpdater.checkForUpdates.mockClear();
    mockAutoUpdater.downloadUpdate.mockClear();
    mockAutoUpdater.quitAndInstall.mockClear();
    mockAutoUpdater.setFeedURL.mockClear();
  });

  it("surfaces install errors after a background update reaches ready", async () => {
    const service = new UpdaterService();

    await service.init();

    mockAutoUpdater.emit("update-available", { version: "0.1.1" });
    mockAutoUpdater.emit("update-downloaded", { version: "0.1.1" });

    expect(service.state).toEqual({ status: "ready", version: "0.1.1" });

    mockAutoUpdater.emit("error", new Error("Bad file descriptor"));

    expect(service.state).toEqual({
      status: "error",
      message: "Bad file descriptor",
    });
  });

  it("does not call quitAndInstall when the ready state is stale", () => {
    const service = new UpdaterService();

    (
      service as never as { _state: { status: "ready"; version: string }; pendingUpdate: null }
    )._state = {
      status: "ready",
      version: "0.1.1",
    };
    (
      service as never as {
        _state: { status: "ready"; version: string };
        pendingUpdate: null;
      }
    ).pendingUpdate = null;

    service.install();

    expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("ignores repeated install requests for the same ready update", async () => {
    const service = new UpdaterService();

    await service.init();

    mockAutoUpdater.emit("update-available", { version: "0.1.1" });
    mockAutoUpdater.emit("update-downloaded", { version: "0.1.1" });

    service.install();
    service.install();

    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
