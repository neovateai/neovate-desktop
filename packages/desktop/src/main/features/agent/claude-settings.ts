import debug from "debug";
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ModelScope } from "../../../shared/features/agent/types";

const log = debug("neovate:claude-settings");

const SESSIONS_DIR = join(homedir(), ".neovate-desktop", "sessions");

function sessionConfigPath(sessionId: string): string {
  return join(SESSIONS_DIR, `${sessionId}.json`);
}

function readJsonFile(filePath: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

function writeJsonFile(filePath: string, data: Record<string, unknown>): void {
  const dir = join(filePath, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Read the effective model for a session.
 * Priority:
 *   1. ~/.neovate-desktop/sessions/<sessionId>.json  (session-scoped)
 *   2. <cwd>/.claude/settings.local.json             (project-scoped)
 *   3. ~/.claude/settings.json                       (global)
 */
export function readModelSetting(
  sessionId: string,
  cwd: string,
): { model: string; scope: ModelScope } | undefined {
  // 1. Session-scoped
  const sessionJson = readJsonFile(sessionConfigPath(sessionId));
  if (typeof sessionJson?.model === "string" && sessionJson.model) {
    log("readModelSetting: session scope model=%s sid=%s", sessionJson.model, sessionId);
    return { model: sessionJson.model, scope: "session" };
  }

  // 2. Project-scoped
  const projectJson = readJsonFile(join(cwd, ".claude", "settings.local.json"));
  if (typeof projectJson?.model === "string" && projectJson.model) {
    log("readModelSetting: project scope model=%s cwd=%s", projectJson.model, cwd);
    return { model: projectJson.model, scope: "project" };
  }

  // 3. Global
  const globalJson = readJsonFile(join(homedir(), ".claude", "settings.json"));
  if (typeof globalJson?.model === "string" && globalJson.model) {
    log("readModelSetting: global scope model=%s", globalJson.model);
    return { model: globalJson.model, scope: "global" };
  }

  return undefined;
}

/**
 * Write (or remove) a model setting at the given scope.
 * Pass `null` to remove the model key (e.g. "Clear session override").
 */
export function writeModelSetting(
  scope: ModelScope,
  model: string | null,
  opts: { sessionId?: string; cwd?: string },
): void {
  switch (scope) {
    case "session": {
      if (!opts.sessionId) throw new Error("sessionId required for session scope");
      const filePath = sessionConfigPath(opts.sessionId);
      if (model === null) {
        try {
          unlinkSync(filePath);
          log("writeModelSetting: removed session config sid=%s", opts.sessionId);
        } catch {
          // File didn't exist — no-op
        }
        return;
      }
      const existing = readJsonFile(filePath) ?? {};
      writeJsonFile(filePath, { ...existing, model });
      log("writeModelSetting: session scope model=%s sid=%s", model, opts.sessionId);
      break;
    }
    case "project": {
      if (!opts.cwd) throw new Error("cwd required for project scope");
      const filePath = join(opts.cwd, ".claude", "settings.local.json");
      const existing = readJsonFile(filePath) ?? {};
      if (model === null) {
        delete existing.model;
      } else {
        existing.model = model;
      }
      writeJsonFile(filePath, existing);
      log("writeModelSetting: project scope model=%s cwd=%s", model, opts.cwd);
      break;
    }
    case "global": {
      const filePath = join(homedir(), ".claude", "settings.json");
      const existing = readJsonFile(filePath) ?? {};
      if (model === null) {
        delete existing.model;
      } else {
        existing.model = model;
      }
      writeJsonFile(filePath, existing);
      log("writeModelSetting: global scope model=%s", model);
      break;
    }
  }
}
