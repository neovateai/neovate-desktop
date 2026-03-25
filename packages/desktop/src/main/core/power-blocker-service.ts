import debug from "debug";
import { powerSaveBlocker } from "electron";

import type { ConfigStore } from "../features/config/config-store";

const log = debug("neovate:power-blocker");

/**
 * Manages an Electron powerSaveBlocker that prevents system sleep
 * while tasks are actively running (submitted/streaming).
 *
 * Activated when `keepAwake` config is on AND at least one turn is active.
 * Uses `prevent-app-suspension` — keeps the process alive but allows screen dimming.
 */
export class PowerBlockerService {
  private blockerId: number | null = null;
  private activeTurns = new Set<string>();
  private unsubscribe: () => void;

  constructor(private configStore: ConfigStore) {
    this.unsubscribe = configStore.onChange("keepAwake", () => this.reconcile());
  }

  /** Called when a session turn starts (submitted/streaming). */
  onTurnStart(sessionId: string): void {
    this.activeTurns.add(sessionId);
    this.reconcile();
  }

  /** Called when a session turn completes or errors. */
  onTurnEnd(sessionId: string): void {
    this.activeTurns.delete(sessionId);
    this.reconcile();
  }

  /** Called when a session is closed entirely. */
  onSessionClosed(sessionId: string): void {
    this.activeTurns.delete(sessionId);
    this.reconcile();
  }

  /** Ensure blocker state matches desired state. */
  private reconcile(): void {
    const enabled = this.configStore.get("keepAwake") === true;
    const shouldBlock = enabled && this.activeTurns.size > 0;

    if (shouldBlock && this.blockerId === null) {
      this.blockerId = powerSaveBlocker.start("prevent-app-suspension");
      log("started: id=%d activeTurns=%d", this.blockerId, this.activeTurns.size);
    } else if (!shouldBlock && this.blockerId !== null) {
      if (powerSaveBlocker.isStarted(this.blockerId)) {
        powerSaveBlocker.stop(this.blockerId);
      }
      log(
        "stopped: id=%d activeTurns=%d enabled=%s",
        this.blockerId,
        this.activeTurns.size,
        enabled,
      );
      this.blockerId = null;
    }
  }

  dispose(): void {
    this.unsubscribe();
    this.activeTurns.clear();
    if (this.blockerId !== null && powerSaveBlocker.isStarted(this.blockerId)) {
      powerSaveBlocker.stop(this.blockerId);
      log("disposed: id=%d", this.blockerId);
    }
    this.blockerId = null;
  }
}
