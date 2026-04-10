import { oc, type, eventIterator } from "@orpc/contract";

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type BrowserEventWrapper<T extends string, P extends Record<string, unknown>> = {
  type: T;
  detail: P;
};

type BrowserNavigationEvent = BrowserEventWrapper<
  "navigation",
  { url: string; canGoBack: boolean; canGoForward: boolean }
>;

type BrowserLoadingEvent = BrowserEventWrapper<
  "loading",
  { isLoading: boolean; canGoBack?: boolean; canGoForward?: boolean }
>;

type BrowserTitleEvent = BrowserEventWrapper<"title", { title: string }>;

type BrowserInspectorEvent = BrowserEventWrapper<"inspector", { active: boolean }>;

export type BrowserEvent =
  | BrowserNavigationEvent
  | BrowserLoadingEvent
  | BrowserTitleEvent
  | BrowserInspectorEvent;

export const browserContract = {
  create: oc
    .input(type<{ viewId: string; url?: string; bounds: BrowserBounds }>())
    .output(type<{ success: boolean }>()),
  destroy: oc.input(type<{ viewId: string }>()).output(type<void>()),
  navigate: oc.input(type<{ viewId: string; url: string }>()).output(type<void>()),
  goBack: oc.input(type<{ viewId: string }>()).output(type<void>()),
  goForward: oc.input(type<{ viewId: string }>()).output(type<void>()),
  reload: oc.input(type<{ viewId: string }>()).output(type<void>()),
  openDevTools: oc.input(type<{ viewId: string }>()).output(type<void>()),
  executeJS: oc
    .input(type<{ viewId: string; code: string }>())
    .output(type<{ result?: unknown; error?: string }>()),
  setBounds: oc.input(type<{ viewId: string; bounds: BrowserBounds }>()).output(type<void>()),
  setVisible: oc.input(type<{ viewId: string; visible: boolean }>()).output(type<void>()),
  events: oc.input(type<{ viewId: string }>()).output(eventIterator(type<BrowserEvent>())),
};
