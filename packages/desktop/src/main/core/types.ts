import type { BrowserWindow } from "electron";

import type { SessionManager } from "../features/agent/session-manager";
import type { Disposable } from "./disposable";

export type AppContext = {
  sessionManager: SessionManager;
};

export interface OpenWindowOptions {
  /** Passed to renderer via URL param — renderer uses this to decide what to render */
  windowType: string;
  width?: number;
  height?: number;
  title?: string;
  /** If true, uses the main window as the parent (modal-style) */
  parent?: boolean;
  /** Additional URL search params passed to the renderer */
  urlSearchParams?: Record<string, string>;
}

export interface IBrowserWindowManager {
  readonly mainWindow: BrowserWindow | null;
  createMainWindow(): BrowserWindow;
  open(options: OpenWindowOptions): void;
  close(windowId: string): void;
  destroyAll(): void;
  ensureMinWidth(minWidth: number): void;
  prepareForQuit(): void;
}

/** Abstract app interface — plugins depend on this, MainApp implements it. */
export interface IMainApp {
  readonly subscriptions: { push(...disposables: Disposable[]): void };
  readonly windowManager: IBrowserWindowManager;
}
