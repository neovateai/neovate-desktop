import { Anthropic } from "@anthropic-ai/sdk";
import { ORPCError, implement } from "@orpc/server";
import debug from "debug";

import type { BenchmarkResult, Provider } from "../../../shared/features/provider/types";
import type { AppContext } from "../../router";

import { providerContract } from "../../../shared/features/provider/contract";
import {
  readProviderSetting,
  writeProviderSetting,
  readProviderModelSetting,
} from "../agent/claude-settings";

const log = debug("neovate:provider-router");

const BENCHMARK_PROMPT = "Say 'Hello, benchmark test!' in exactly those words.";
const BENCHMARK_TIMEOUT_MS = 30000; // 30 second timeout

/**
 * Calculate average TTFT from values array
 * Filter out zero values (from vector(0) fallback)
 * @param values - Array of TTFT/TPOT values
 * @return Average value or null if no valid data
 */
function calculateAvg(values: number[]): number | null {
  if (!values || values.length === 0) {
    return null;
  }

  // Filter out zero values (from vector(0) fallback)
  const nonZeroValues = values.filter((v) => v > 0);

  if (nonZeroValues.length === 0) {
    return null;
  }

  const sum = nonZeroValues.reduce((acc, val) => acc + val, 0);
  return sum / nonZeroValues.length;
}

async function runBenchmark(provider: Provider, modelId: string): Promise<BenchmarkResult> {
  const startTime = performance.now();
  let firstTokenTime: number | null = null;
  // Store TPOT values (Time Per Output Token in ms)
  const tpotValues: number[] = [];
  let lastTokenTime: number | null = null;
  let tokenCount = 0;

  try {
    const client = new Anthropic({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
    });

    const stream = client.messages.stream({
      model: modelId,
      max_tokens: 100,
      messages: [{ role: "user", content: BENCHMARK_PROMPT }],
    });

    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Benchmark timeout after ${BENCHMARK_TIMEOUT_MS}ms`));
      }, BENCHMARK_TIMEOUT_MS);
    });

    // Race between stream completion and timeout
    const streamPromise = (async () => {
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          const now = performance.now();

          // Record first token time for TTFT
          if (firstTokenTime === null) {
            firstTokenTime = now;
          }

          // Calculate TPOT (Time Per Output Token) for each subsequent token
          if (lastTokenTime !== null) {
            const timeSinceLastToken = now - lastTokenTime;
            tpotValues.push(timeSinceLastToken);
          }
          lastTokenTime = now;

          if (event.delta.type === "text_delta") {
            tokenCount++;
          }
        }
      }
    })();

    await Promise.race([streamPromise, timeoutPromise]);

    const endTime = performance.now();
    const ttftMs = firstTokenTime ? firstTokenTime - startTime : 0;
    const totalTimeMs = endTime - startTime;

    // Calculate TPOT and TPS according to ModelService logic
    // TPOT = avg time per output token (ms/token)
    // TPS = 1000 / tpot (tokens/s)
    const tpot = calculateAvg(tpotValues) ?? 0;
    const tps = tpot > 0 ? 1000 / tpot : 0;

    return {
      ttftMs: Math.round(ttftMs),
      tpot: Math.round(tpot * 100) / 100,
      tps: Math.round(tps * 100) / 100,
      totalTimeMs: Math.round(totalTimeMs),
      tokensGenerated: tokenCount,
      success: true,
    };
  } catch (err) {
    log("benchmark failed: provider=%s model=%s error=%s", provider.id, modelId, err);
    return {
      ttftMs: 0,
      tpot: 0,
      tps: 0,
      totalTimeMs: 0,
      tokensGenerated: 0,
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
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

  benchmarkModel: os.provider.benchmarkModel.handler(async ({ input, context }) => {
    const { providerId, modelId } = input;

    const provider = context.configStore.getProvider(providerId);
    if (!provider) {
      throw new ORPCError("NOT_FOUND", {
        defined: true,
        message: `Provider not found: ${providerId}`,
      });
    }

    if (!provider.enabled) {
      throw new ORPCError("BAD_REQUEST", {
        defined: true,
        message: `Provider ${provider.name} is disabled`,
      });
    }

    if (!provider.models[modelId]) {
      throw new ORPCError("BAD_REQUEST", {
        defined: true,
        message: `Model ${modelId} not found in provider ${provider.name}`,
      });
    }

    log("benchmarkModel: provider=%s model=%s", providerId, modelId);
    return runBenchmark(provider, modelId);
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
