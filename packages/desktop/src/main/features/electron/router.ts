import { implement } from "@orpc/server";
import debug from "debug";
import { BrowserWindow, dialog } from "electron";

import type { AppContext } from "../../router";

import { electronContract } from "../../../shared/features/electron/contract";

const log = debug("neovate:electron");

const os = implement({ electron: electronContract }).$context<AppContext>();

export const electronRouter = os.electron.router({
  dialog: os.electron.dialog.router({
    showOpenDialog: os.electron.dialog.showOpenDialog.handler(async ({ input }) => {
      log("dialog.showOpenDialog", input);
      const win = BrowserWindow.getFocusedWindow();
      const result = win
        ? await dialog.showOpenDialog(win, input)
        : await dialog.showOpenDialog(input);
      log("dialog.showOpenDialog result", {
        canceled: result.canceled,
        count: result.filePaths.length,
      });
      return result;
    }),
  }),
});
