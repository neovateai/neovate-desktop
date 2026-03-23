import { Anthropic } from "@anthropic-ai/sdk";
import { ORPCError, implement } from "@orpc/server";
import debug from "debug";

import type { BenchmarkModelTestResult, Provider } from "../../../shared/features/provider/types";
import type { AppContext } from "../../router";

import { providerContract } from "../../../shared/features/provider/contract";
import {
  readProviderSetting,
  writeProviderSetting,
  readProviderModelSetting,
} from "../agent/claude-settings";

const log = debug("neovate:provider-router");

const BENCHMARK_PROMPT =
  "Write a short paragraph explaining what a benchmark test measures in software engineering.";
const BENCHMARK_MAX_TOKENS = 100;
const BENCHMARK_TIMEOUT_MS = 30_000;
const QUICK_CHECK_TIMEOUT_MS = 10_000;

function createBenchmarkClient(provider: Provider): Anthropic {
  return new Anthropic({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
  });
}

function calculateAvg(values: number[]): number | null {
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length === 0) return null;
  return nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
}

async function runQuickCheck(
  provider: Provider,
  modelId: string,
  externalSignal?: AbortSignal,
): Promise<{ success: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUICK_CHECK_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);

  try {
    const client = createBenchmarkClient(provider);
    await client.messages.create(
      {
        model: modelId,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      },
      { signal: controller.signal },
    );
    return { success: true };
  } catch (err) {
    log("quickCheck failed: provider=%s model=%s error=%s", provider.id, modelId, err);

    let error: string;
    if (err instanceof Anthropic.APIError) {
      const parts = [`${err.status}`];
      const body = err.error as Record<string, unknown> | undefined;
      const inner = body?.error as Record<string, unknown> | undefined;
      if (inner?.type) parts.push(String(inner.type));
      if (inner?.message) parts.push(String(inner.message));
      else if (err.message) parts.push(err.message);
      error = parts.join(" — ");
    } else if (err instanceof Error) {
      error = err.message;
    } else {
      error = String(err);
    }

    return { success: false, error };
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

async function runBenchmark(
  provider: Provider,
  modelId: string,
  externalSignal?: AbortSignal,
): Promise<Omit<BenchmarkModelTestResult, "type">> {
  const startTime = performance.now();
  let firstTokenTime: number | null = null;
  const tpotValues: number[] = [];
  let lastTokenTime: number | null = null;

  // Combine external signal (client cancel) with internal timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BENCHMARK_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);

  try {
    const client = createBenchmarkClient(provider);
    const stream = client.messages.stream(
      {
        model: modelId,
        max_tokens: BENCHMARK_MAX_TOKENS,
        messages: [{ role: "user", content: BENCHMARK_PROMPT }],
      },
      { signal: controller.signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        const now = performance.now();
        if (firstTokenTime === null) {
          firstTokenTime = now;
        }
        if (lastTokenTime !== null) {
          tpotValues.push(now - lastTokenTime);
        }
        lastTokenTime = now;
      }
    }

    const finalMessage = await stream.finalMessage();
    const tokensGenerated = finalMessage.usage?.output_tokens ?? tpotValues.length + 1;

    const endTime = performance.now();
    const ttftMs = firstTokenTime ? firstTokenTime - startTime : 0;
    const totalTimeMs = endTime - startTime;
    const tpot = calculateAvg(tpotValues) ?? 0;
    const tps = tpot > 0 ? 1000 / tpot : 0;

    return {
      ttftMs: Math.round(ttftMs),
      tpot: Math.round(tpot * 100) / 100,
      tps: Math.round(tps * 100) / 100,
      totalTimeMs: Math.round(totalTimeMs),
      tokensGenerated,
      success: true,
    };
  } catch (err) {
    log("benchmark failed: provider=%s model=%s error=%s", provider.id, modelId, err);

    let error: string;
    if (err instanceof Anthropic.APIError) {
      const parts = [`${err.status}`];
      // Extract error type from the JSON body if available
      const body = err.error as Record<string, unknown> | undefined;
      const inner = body?.error as Record<string, unknown> | undefined;
      if (inner?.type) parts.push(String(inner.type));
      if (inner?.message) parts.push(String(inner.message));
      else if (err.message) parts.push(err.message);
      error = parts.join(" — ");
    } else if (err instanceof Error) {
      error = err.message;
    } else {
      error = String(err);
    }

    return {
      ttftMs: 0,
      tpot: 0,
      tps: 0,
      totalTimeMs: 0,
      tokensGenerated: 0,
      success: false,
      error,
    };
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

const os = implement({ provider: providerContract }).$context<AppContext>();

export const providerRouter = os.provider.router({
  list: os.provider.list.handler(({ context }) => {
    return context.configStore.getProviders();
  }),

  get: os.provider.get.handler(({ input, context }) => {
    return context.configStore.getProvider(input.id) ?? null;
  }),

  create: os.provider.create.handler(({ input, context }) => {
    const existing = context.configStore.getProviders();

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
      ...(input.builtInId ? { builtInId: input.builtInId } : {}),
    };

    context.configStore.addProvider(provider);
    log("create: name=%s id=%s", provider.name, provider.id);
    return provider;
  }),

  update: os.provider.update.handler(({ input, context }) => {
    const { id, ...updates } = input;
    const current = context.configStore.getProvider(id);
    if (!current) {
      throw new ORPCError("NOT_FOUND", { defined: true, message: `Provider not found: ${id}` });
    }

    // Validate unique name
    if (updates.name && updates.name !== current.name) {
      const existing = context.configStore.getProviders();
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

    const updated = context.configStore.updateProvider(id, updates);
    log("update: id=%s name=%s", id, updated.name);
    return updated;
  }),

  remove: os.provider.remove.handler(({ input, context }) => {
    context.configStore.removeProvider(input.id);
    log("remove: id=%s", input.id);
  }),

  quickCheck: os.provider.quickCheck.handler(async ({ input, signal }) => {
    const { baseURL, apiKey, modelId } = input;
    log("quickCheck: baseURL=%s model=%s", baseURL, modelId);
    return runQuickCheck({ id: "_check", baseURL, apiKey } as Provider, modelId, signal);
  }),

  checkModel: os.provider.checkModel.handler(async ({ input, signal }) => {
    const { baseURL, apiKey, modelId } = input;
    log("checkModel: baseURL=%s model=%s", baseURL, modelId);
    return runBenchmark({ id: "_check", baseURL, apiKey } as Provider, modelId, signal);
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
    writeProviderSetting(
      scope,
      providerId,
      { sessionId, cwd },
      context.configStore,
      context.projectStore,
    );

    // Write model to provider config (not .claude/ — those are for SDK Default)
    if (model !== undefined && model !== null) {
      if (scope === "project") {
        context.projectStore.setProjectSelection(cwd, undefined, model);
      } else if (scope === "global") {
        context.configStore.setGlobalSelection(undefined, model);
      }
    }

    // Re-read effective values
    const effectiveProvider = readProviderSetting(
      sessionId,
      cwd,
      context.configStore,
      context.projectStore,
    );
    let effectiveModel:
      | { model: string; scope: import("../../../shared/features/agent/types").ModelScope }
      | undefined;

    if (effectiveProvider) {
      const pm = readProviderModelSetting(
        sessionId,
        cwd,
        effectiveProvider.provider,
        context.configStore,
        context.projectStore,
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
