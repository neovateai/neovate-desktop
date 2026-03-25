import { is } from "@electron-toolkit/utils";
import debug from "debug";
import log from "electron-log/main";
import { readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { APP_DATA_DIR } from "./app-paths";

const LOGS_DIR = join(APP_DATA_DIR, "logs");
const DEV_LOG = join(tmpdir(), "neovate-dev.log");
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const RETENTION_DAYS = 7;

function todayFileName(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}.log`;
}

// -- Configure electron-log --

log.transports.file.resolvePathFn = () => (is.dev ? DEV_LOG : join(LOGS_DIR, todayFileName()));

log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";

// 500MB file size guard (production only)
if (!is.dev) {
  let suspended = false;

  log.hooks.push((message) => {
    if (suspended) return false;

    const file = log.transports.file.getFile();
    if (file && file.size >= MAX_FILE_SIZE) {
      suspended = true;
      message.data = ["Log file size limit (500MB) reached, logging suspended until tomorrow"];
      message.level = "warn";
      return message;
    }

    return message;
  });
}

// -- Override console --

Object.assign(console, log.functions);

// -- Dev: truncate /tmp/dev.log on start --

if (is.dev) {
  try {
    writeFileSync(DEV_LOG, "");
  } catch {
    // Ignore
  }
}

// -- Production: clean up old log files --

if (!is.dev) {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const file of readdirSync(LOGS_DIR)) {
      if (!file.endsWith(".log")) continue;
      const filePath = join(LOGS_DIR, file);
      try {
        const { mtimeMs } = statSync(filePath);
        if (mtimeMs < cutoff) unlinkSync(filePath);
      } catch {
        // Ignore individual file errors
      }
    }
  } catch {
    // Logs dir may not exist yet
  }
}

// -- Enable all neovate debug namespaces (merge with existing DEBUG) --

const existing = process.env.DEBUG || "";
debug.enable(existing ? `${existing},neovate:*` : "neovate:*");

// -- Override debug formatArgs to skip timestamp/colors (electron-log handles that) --

debug.formatArgs = function (this: debug.Debugger, args: string[]) {
  args[0] = `${this.namespace} ${args[0]}`;
};

// -- Pipe debug output through electron-log --

debug.log = (...args: unknown[]) => {
  log.debug(...args);
};

export default log;
