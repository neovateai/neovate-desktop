import { oc, type, eventIterator } from "@orpc/contract";

export interface EditorEvent {
  type: string;
  detail: Record<string, any>;
}

export const editorContract = {
  start: oc.input(type<void>()).output(type<{ url: string; error?: string }>()),
  connect: oc.input(type<void>()).output(type<{}>()),
  open: oc.input(type<{ cwd: string; filePath: string; line?: number }>()).output(type<{}>()),
  setTheme: oc.input(type<{ cwd: string; theme: string }>()).output(type<{}>()),
  events: oc.input(type<{ cwd: string }>()).output(eventIterator(type<EditorEvent>())),
};
