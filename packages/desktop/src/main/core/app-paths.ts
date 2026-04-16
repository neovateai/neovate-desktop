import { homedir } from "node:os";
import { join } from "node:path";

import { APP_ID } from "../../shared/constants";
import { isWindows } from "../../shared/platform";

const devSuffix = import.meta.env.DEV ? "-dev" : "";

export const APP_DATA_DIR = isWindows
  ? join(process.env["APPDATA"] || join(homedir(), "AppData", "Roaming"), `${APP_ID}${devSuffix}`)
  : join(homedir(), `.${APP_ID}${devSuffix}`);

export const PLAYGROUND_DIR = join(APP_DATA_DIR, "workspaces", "playground");
