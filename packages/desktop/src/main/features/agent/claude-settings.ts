import debug from "debug";
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ModelScope } from "../../../shared/features/agent/types";
import type { Provider } from "../../../shared/features/provider/types";
import type { ConfigStore } from "../config/config-store";
import type { ProjectStore } from "../project/project-store";

import { APP_DATA_DIR } from "../../core/app-paths";

const log = debug("neovate:claude-settings");

const SESSIONS_DIR = join(APP_DATA_DIR, "sessions");

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
  // "default" is not a real model ID — ignore it (same as unset)
  if (typeof globalJson?.model === "string" && globalJson.model && globalJson.model !== "default") {
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
      // "default" is the SDK alias for "use default model" — not a real model ID.
      // Writing it to settings.json breaks Claude Code CLI.
      const effectiveModel = model === "default" ? null : model;
      if (effectiveModel === null) {
        delete existing.model;
      } else {
        existing.model = effectiveModel;
      }
      writeJsonFile(filePath, existing);
      log("writeModelSetting: global scope model=%s", effectiveModel);
      break;
    }
  }
}

/**
 * Resolve the active provider for a session.
 * Priority: session -> project -> global.
 * Skips nonexistent or disabled providers.
 */
export function readProviderSetting(
  sessionId: string,
  cwd: string,
  configStore: ConfigStore,
  projectStore: ProjectStore,
): { provider: Provider; scope: ModelScope } | undefined {
  // 1. Session-scoped
  const sessionJson = readJsonFile(sessionConfigPath(sessionId));
  if (typeof sessionJson?.provider === "string" && sessionJson.provider) {
    const p = configStore.getProvider(sessionJson.provider);
    if (p?.enabled) {
      log("readProviderSetting: session scope provider=%s sid=%s", p.name, sessionId);
      return { provider: p, scope: "session" };
    }
  }

  // 2. Project-scoped
  const projectSel = projectStore.getProjectSelection(cwd);
  if (projectSel.provider) {
    const p = configStore.getProvider(projectSel.provider);
    if (p?.enabled) {
      log("readProviderSetting: project scope provider=%s cwd=%s", p.name, cwd);
      return { provider: p, scope: "project" };
    }
  }

  // 3. Global
  const globalSel = configStore.getGlobalSelection();
  if (globalSel.provider) {
    const p = configStore.getProvider(globalSel.provider);
    if (p?.enabled) {
      log("readProviderSetting: global scope provider=%s", p.name);
      return { provider: p, scope: "global" };
    }
  }

  return undefined;
}

/**
 * Write (or remove) a provider selection at the given scope.
 */
export function writeProviderSetting(
  scope: ModelScope,
  providerId: string | null,
  opts: { sessionId?: string; cwd?: string },
  configStore: ConfigStore,
  projectStore: ProjectStore,
): void {
  switch (scope) {
    case "session": {
      if (!opts.sessionId) throw new Error("sessionId required for session scope");
      const filePath = sessionConfigPath(opts.sessionId);
      const existing = readJsonFile(filePath) ?? {};
      if (providerId === null) {
        delete existing.provider;
      } else {
        existing.provider = providerId;
      }
      writeJsonFile(filePath, existing);
      log("writeProviderSetting: session scope provider=%s sid=%s", providerId, opts.sessionId);
      break;
    }
    case "project": {
      if (!opts.cwd) throw new Error("cwd required for project scope");
      projectStore.setProjectSelection(opts.cwd, providerId);
      log("writeProviderSetting: project scope provider=%s cwd=%s", providerId, opts.cwd);
      break;
    }
    case "global": {
      configStore.setGlobalSelection(providerId);
      log("writeProviderSetting: global scope provider=%s", providerId);
      break;
    }
  }
}

/**
 * Resolve model within a provider context.
 * Priority: session model -> project model -> global model -> provider.modelMap.model
 * Falls back to modelMap.model if resolved model is not in provider's catalog.
 */
export function readProviderModelSetting(
  sessionId: string,
  cwd: string,
  provider: Provider,
  configStore: ConfigStore,
  projectStore: ProjectStore,
): { model: string; scope: ModelScope } {
  const fallback = provider.modelMap.model ?? Object.keys(provider.models)[0];

  // 1. Session-scoped model
  const sessionJson = readJsonFile(sessionConfigPath(sessionId));
  if (typeof sessionJson?.model === "string" && sessionJson.model) {
    const model = sessionJson.model in provider.models ? sessionJson.model : fallback;
    return { model, scope: "session" };
  }

  // 2. Project-scoped model
  const projectSel = projectStore.getProjectSelection(cwd);
  if (projectSel.model) {
    const model = projectSel.model in provider.models ? projectSel.model : fallback;
    return { model, scope: "project" };
  }

  // 3. Global model
  const globalSel = configStore.getGlobalSelection();
  if (globalSel.model) {
    const model = globalSel.model in provider.models ? globalSel.model : fallback;
    return { model, scope: "global" };
  }

  // 4. Provider default
  return { model: fallback, scope: "global" };
}
