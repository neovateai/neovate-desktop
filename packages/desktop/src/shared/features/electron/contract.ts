import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";

import { oc, type } from "@orpc/contract";

const dialogContract = {
  showOpenDialog: oc.input(type<OpenDialogOptions>()).output(type<OpenDialogReturnValue>()),
};

const windowContract = {
  isFullScreen: oc.output(type<boolean>()),
};

export const electronContract = {
  dialog: dialogContract,
  window: windowContract,
};
