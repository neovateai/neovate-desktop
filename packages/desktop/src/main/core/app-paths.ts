import { homedir } from "node:os";
import { join } from "node:path";

import { APP_ID } from "../../shared/constants";
import { isWindows } from "../../shared/platform";

export const APP_DATA_DIR = isWindows
  ? join(process.env["APPDATA"] || join(homedir(), "AppData", "Roaming"), APP_ID)
  : join(homedir(), `.${APP_ID}`);

export const PLAYGROUND_DIR = join(APP_DATA_DIR, "workspaces", "playground");
