import { implement } from "@orpc/server";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AppConfig } from "../../../shared/features/config/types";
import type { AppContext } from "../../router";

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
      return { providerId: sel.provider, model: sel.model };
    }
    // SDK Default: read model from ~/.claude/settings.json
    try {
      const json = JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf-8"));
      if (typeof json?.model === "string" && json.model) {
        return { model: json.model };
      }
    } catch {
      // file doesn't exist or invalid JSON
    }
    return {};
  }),

  setGlobalModelSelection: os.config.setGlobalModelSelection.handler(({ input, context }) => {
    const { providerId, model } = input;
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
    context.configStore.set(input.key, input.value as AppConfig[typeof input.key]);
  }),
});
