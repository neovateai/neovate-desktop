import { oc, type, eventIterator } from "@orpc/contract";

type EditorEventWrapper<T extends string, P extends Record<string, any>> = {
  type: T;
  detail: P;
};

export interface IEditorTab {
  isActive: boolean;
  isPreview: boolean;
  relPath: string;
  fullPath: string;
}

type EditorContextAddEvent = EditorEventWrapper<
  "context.add",
  {
    type: "file";
    data: { relPath: string };
  }
>;

type EditorLinkOpenEvent = EditorEventWrapper<"link.open", { url: string }>;

type EditorTabsChangeEvent = EditorEventWrapper<"tabs.change", { tabs: IEditorTab[] }>;

type EditorDevToolsOpenEvent = EditorEventWrapper<"devtools.open", {}>;

export type EditorEvent =
  | EditorContextAddEvent
  | EditorTabsChangeEvent
  | EditorLinkOpenEvent
  | EditorDevToolsOpenEvent;

export interface EditorOpenOption {
  fullPath: string;
  line?: number;
  /** whether autofocus to editor when opened, default false */
  focus?: boolean;
}

export const editorContract = {
  start: oc.input(type<void>()).output(type<{ url: string; error?: string }>()),
  connect: oc
    .input(type<void>())
    .output(type<{ success: boolean; data?: Record<string, unknown>; error?: string }>()),
  ping: oc.input(type<{ cwd: string }>()).output(type<{ connected: boolean }>()),
  open: oc.input(type<{ cwd: string } & EditorOpenOption>()).output(
    type<{
      success: boolean;
      error?: string;
    }>(),
  ),
  setTheme: oc.input(type<{ cwd: string; theme: string }>()).output(type<{}>()),
  events: oc.input(type<{ cwd: string }>()).output(eventIterator(type<EditorEvent>())),
};
