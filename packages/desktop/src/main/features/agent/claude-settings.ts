import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import debug from "debug";

const log = debug("neovate:claude-settings");

const SESSIONS_DIR = join(homedir(), ".neovate-desktop", "sessions");

function sessionConfigPath(sessionId: string): string {
  return join(SESSIONS_DIR, `${sessionId}.json`);
}

/**
 * Read the effective model for a session.
 * Priority:
 *   1. ~/.neovate-desktop/sessions/<sessionId>.json  (session-scoped)
 *   2. <cwd>/.claude/settings.local.json
 *   3. <cwd>/.claude/settings.json
 *   4. ~/.claude/settings.json
 */
export function readModelFromSettings(sessionId: string, cwd: string): string | undefined {
  // 1. Session-scoped config (highest priority)
  try {
    const raw = readFileSync(sessionConfigPath(sessionId), "utf-8");
    const json = JSON.parse(raw);
    if (typeof json.model === "string" && json.model) {
      log("readModelFromSettings: found model=%s in session config sid=%s", json.model, sessionId);
      return json.model;
    }
  } catch {
    // not found — fall through
  }

  // 2. Claude settings chain
  const sources = [
    join(cwd, ".claude", "settings.local.json"),
    join(cwd, ".claude", "settings.json"),
    join(homedir(), ".claude", "settings.json"),
  ];

  for (const path of sources) {
    try {
      const raw = readFileSync(path, "utf-8");
      const json = JSON.parse(raw);
      if (typeof json.model === "string" && json.model) {
        log("readModelFromSettings: found model=%s in %s", json.model, path);
        return json.model;
      }
    } catch {
      // file doesn't exist or invalid JSON — skip
    }
  }

  log("readModelFromSettings: no model found, sid=%s cwd=%s", sessionId, cwd);
  return undefined;
}

/**
 * Write the model to ~/.neovate-desktop/sessions/<sessionId>.json.
 * Merges with existing content if the file already exists.
 */
export function writeModelToSettings(sessionId: string, model: string): void {
  const filePath = sessionConfigPath(sessionId);

  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    // file doesn't exist or invalid — start fresh
  }

  existing.model = model;

  mkdirSync(SESSIONS_DIR, { recursive: true });
  writeFileSync(filePath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  log("writeModelToSettings: wrote model=%s for sid=%s", model, sessionId);
}
