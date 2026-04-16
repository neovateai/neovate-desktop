import { implement } from "@orpc/server";
import debug from "debug";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AppConfig } from "../../../shared/features/config/types";
import type { AppContext } from "../../router";

const log = debug("neovate:config");

import { configContract } from "../../../shared/features/config/contract";
import { writeModelSetting } from "../agent/claude-settings";

const os = implement({ config: configContract }).$context<AppContext>();

export const configRouter = os.config.router({
  get: os.config.get.handler(({ context }) => {
    return context.configStore.getAll();
  }),

  getGlobalModelSelection: os.config.getGlobalModelSelection.handler(({ context }) => {
    const sel = context.configStore.getGlobalSelection();
    if (sel.provider) {
      log("getGlobalModelSelection: provider=%s model=%s", sel.provider, sel.model);
      return { providerId: sel.provider, model: sel.model };
    }
    // SDK Default: read model from ~/.claude/settings.json
    try {
      const json = JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf-8"));
      // Ignore "default" — it's not a real model ID, treat as unset
      if (typeof json?.model === "string" && json.model && json.model !== "default") {
        log("getGlobalModelSelection: SDK default model=%s", json.model);
        return { model: json.model };
      }
    } catch {
      // file doesn't exist or invalid JSON
    }
    log("getGlobalModelSelection: no selection");
    return {};
  }),

  setGlobalModelSelection: os.config.setGlobalModelSelection.handler(({ input, context }) => {
    const { providerId, model } = input;
    log("setGlobalModelSelection: providerId=%s model=%s", providerId, model);
    if (providerId) {
      // Provider mode: store in configStore, clear SDK Default model
      context.configStore.setGlobalSelection(providerId, model);
      writeModelSetting("global", null, {});
    } else {
      // SDK Default mode: clear provider from configStore, write model to ~/.claude/settings.json
      context.configStore.setGlobalSelection(null, null);
      writeModelSetting("global", model, {});
    }
  }),

  set: os.config.set.handler(({ input, context }) => {
    log("set: key=%s", input.key);
    context.configStore.set(input.key, input.value as AppConfig[typeof input.key]);
  }),
});
