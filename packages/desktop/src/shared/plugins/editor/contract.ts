import { oc, type, eventIterator } from "@orpc/contract";

type EditorEventWrapper<T extends string, P extends Record<string, any>> = {
  type: T;
  detail: P;
};

type EditorContextAddEvent = EditorEventWrapper<
  "context.add",
  {
    type: "file";
    data: { relPath: string };
  }
>;

type EditorLinkOpenEvent = EditorEventWrapper<"link.open", { url: string }>;

type EditorTabsChangeEvent = EditorEventWrapper<
  "tabs.change",
  {
    tabs: Array<{
      isActive: boolean;
      isPreview: boolean;
      relPath: string;
      fullPath: string;
    }>;
  }
>;

export type EditorEvent = EditorContextAddEvent | EditorTabsChangeEvent | EditorLinkOpenEvent;

export interface EditorOpenOption {
  fullPath: string;
  line?: number;
  /** whether autofocus to editor when opened, default false */
  focus?: boolean;
}

export const editorContract = {
  start: oc.input(type<void>()).output(type<{ url: string; error?: string }>()),
  connect: oc.input(type<void>()).output(type<{}>()),
  open: oc.input(type<{ cwd: string } & EditorOpenOption>()).output(
    type<{
      success: boolean;
      error?: string;
    }>(),
  ),
  setTheme: oc.input(type<{ cwd: string; theme: string }>()).output(type<{}>()),
  events: oc.input(type<{ cwd: string }>()).output(eventIterator(type<EditorEvent>())),
};
