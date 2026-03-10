import { ORPCError, implement } from "@orpc/server";
import debug from "debug";

import type { AppContext } from "../../router";

import { providerContract } from "../../../shared/features/provider/contract";
import {
  readProviderSetting,
  writeProviderSetting,
  readProviderModelSetting,
} from "../agent/claude-settings";

const log = debug("neovate:provider-router");

const os = implement({ provider: providerContract }).$context<AppContext>();

export const providerRouter = os.provider.router({
  list: os.provider.list.handler(({ context }) => {
    return context.providerStore.getProviders();
  }),

  get: os.provider.get.handler(({ input, context }) => {
    return context.providerStore.getProvider(input.id) ?? null;
  }),

  create: os.provider.create.handler(({ input, context }) => {
    const existing = context.providerStore.getProviders();

    // Validate unique name
    if (existing.some((p) => p.name === input.name)) {
      throw new ORPCError("BAD_REQUEST", {
        defined: true,
        message: `Provider name "${input.name}" already exists`,
      });
    }

    // Validate modelMap values reference keys in models
    for (const [slot, modelId] of Object.entries(input.modelMap)) {
      if (modelId && !(modelId in input.models)) {
        throw new ORPCError("BAD_REQUEST", {
          defined: true,
          message: `modelMap.${slot} references "${modelId}" which is not in models`,
        });
      }
    }

    // Derive ID from name: lowercase, replace non-alphanumeric with dash, dedupe
    let id = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!id) id = "provider";
    if (existing.some((p) => p.id === id)) {
      let i = 2;
      while (existing.some((p) => p.id === `${id}-${i}`)) i++;
      id = `${id}-${i}`;
    }

    const provider = {
      id,
      name: input.name,
      enabled: true,
      baseURL: input.baseURL,
      apiKey: input.apiKey,
      models: input.models,
      modelMap: input.modelMap,
      envOverrides: input.envOverrides ?? {},
    };

    context.providerStore.addProvider(provider);
    log("create: name=%s id=%s", provider.name, provider.id);
    return provider;
  }),

  update: os.provider.update.handler(({ input, context }) => {
    const { id, ...updates } = input;
    const current = context.providerStore.getProvider(id);
    if (!current) {
      throw new ORPCError("NOT_FOUND", { defined: true, message: `Provider not found: ${id}` });
    }

    // Validate unique name
    if (updates.name && updates.name !== current.name) {
      const existing = context.providerStore.getProviders();
      if (existing.some((p) => p.name === updates.name && p.id !== id)) {
        throw new ORPCError("BAD_REQUEST", {
          defined: true,
          message: `Provider name "${updates.name}" already exists`,
        });
      }
    }

    // Validate modelMap references
    const models = updates.models ?? current.models;
    const modelMap = updates.modelMap ?? current.modelMap;
    for (const [slot, modelId] of Object.entries(modelMap)) {
      if (modelId && !(modelId in models)) {
        throw new ORPCError("BAD_REQUEST", {
          defined: true,
          message: `modelMap.${slot} references "${modelId}" which is not in models`,
        });
      }
    }

    const updated = context.providerStore.updateProvider(id, updates);
    log("update: id=%s name=%s", id, updated.name);
    return updated;
  }),

  remove: os.provider.remove.handler(({ input, context }) => {
    context.providerStore.removeProvider(input.id);
    log("remove: id=%s", input.id);
  }),

  setSelection: os.provider.setSelection.handler(({ input, context }) => {
    const { sessionId, providerId, model, scope } = input;
    const cwd = context.sessionManager.getSessionCwd(sessionId);
    log(
      "setSelection: sessionId=%s providerId=%s model=%s scope=%s",
      sessionId,
      providerId,
      model,
      scope,
    );

    // Write provider setting
    writeProviderSetting(scope, providerId, { sessionId, cwd }, context.providerStore);

    // Write model to provider config files (not .claude/ — those are for SDK Default)
    if (model !== undefined && model !== null) {
      if (scope === "project") {
        context.providerStore.setProjectSelection(cwd, undefined, model);
      } else if (scope === "global") {
        context.providerStore.setGlobalSelection(undefined, model);
      }
    }

    // Re-read effective values
    const effectiveProvider = readProviderSetting(sessionId, cwd, context.providerStore);
    let effectiveModel:
      | { model: string; scope: import("../../../shared/features/agent/types").ModelScope }
      | undefined;

    if (effectiveProvider) {
      const pm = readProviderModelSetting(
        sessionId,
        cwd,
        effectiveProvider.provider,
        context.providerStore,
      );
      effectiveModel = pm;
    }

    return {
      providerId: effectiveProvider?.provider.id,
      model: effectiveModel?.model,
      providerScope: effectiveProvider?.scope,
      modelScope: effectiveModel?.scope,
    };
  }),
});
