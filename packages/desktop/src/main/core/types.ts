import type { BrowserWindow } from "electron";
import type { AcpConnectionManager } from "../features/acp/connection-manager";
import type { Disposable } from "./disposable";

export type AppContext = {
  acpConnectionManager: AcpConnectionManager;
};

export interface OpenWindowOptions {
  /** Unique window ID — re-focuses existing window if already open */
  windowId: string;
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
}

/** Abstract app interface — plugins depend on this, MainApp implements it. */
export interface IMainApp {
  readonly subscriptions: { push(...disposables: Disposable[]): void };
  readonly windowManager: IBrowserWindowManager;
}
