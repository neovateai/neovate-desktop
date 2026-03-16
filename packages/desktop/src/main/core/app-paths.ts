import { homedir } from "node:os";
import { join } from "node:path";

import { APP_ID } from "../../shared/constants";

export const APP_DATA_DIR = join(homedir(), `.${APP_ID}`);
