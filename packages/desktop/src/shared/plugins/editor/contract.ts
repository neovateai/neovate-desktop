import { oc, type } from "@orpc/contract";

export const editorContract = {
  start: oc.input(type<void>()).output(type<{ url: string }>()),
  connect: oc.input(type<{ cwd: string }>()).output(type<{}>()),
  open: oc.input(type<{ cwd: string; filePath: string; line?: number }>()).output(type<{}>()),
};
