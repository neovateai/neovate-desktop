import debug from "debug";

const log = debug("neovate:remote-control:wechat:sync");

/**
 * Manages the getUpdates sync cursor via a callback.
 * The adapter provides a save function that persists to the config store.
 */
export class SyncCursorStore {
  private cursor = "";
  private saveFn: ((cursor: string) => void) | null = null;

  init(cursor: string, saveFn: (cursor: string) => void): void {
    this.cursor = cursor || "";
    this.saveFn = saveFn;
    if (this.cursor) {
      log("resuming from saved sync cursor (%d bytes)", this.cursor.length);
    }
  }

  get(): string {
    return this.cursor;
  }

  update(cursor: string): void {
    if (!cursor || cursor === this.cursor) return;
    this.cursor = cursor;
    this.saveFn?.(cursor);
  }

  reset(): void {
    this.cursor = "";
    this.saveFn = null;
  }
}
