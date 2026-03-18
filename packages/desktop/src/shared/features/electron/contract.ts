import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";

import { oc, type } from "@orpc/contract";

const dialogContract = {
  showOpenDialog: oc.input(type<OpenDialogOptions>()).output(type<OpenDialogReturnValue>()),
};

export const electronContract = {
  dialog: dialogContract,
};
