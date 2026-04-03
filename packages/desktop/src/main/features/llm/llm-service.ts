import { Anthropic } from "@anthropic-ai/sdk";
import debug from "debug";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  ILlmService,
  LlmMessage,
  LlmQueryOptions,
  LlmQueryResult,
} from "../../../shared/features/llm/types";
import type { IShellService } from "../../core/shell-service";
import type { ConfigStore } from "../config/config-store";

const log = debug("neovate:llm-service");

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;

/** Decode "providerId:modelId" -> { providerId, model }. Same encoding as GlobalModelSelect. */
function decodeSelection(value: string): { providerId: string | null; model: string | null } {
  if (!value) return { providerId: null, model: null };
  const idx = value.indexOf(":");
  const providerId = value.slice(0, idx) || null;
  const model = value.slice(idx + 1) || null;
  return { providerId, model };
}

/** Read and parse a JSON file, returning undefined on any error. */
function readJsonFile(filePath: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

export class LlmService implements ILlmService {
  private cachedClient: Anthropic | null = null;
  private cachedProviderId: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private configStore: ConfigStore,
    private shellService: IShellService,
  ) {
    // Invalidate cached client when relevant config changes
    this.unsubscribe = this.configStore.onAnyChange((newVal, oldVal) => {
      const relevant =
        newVal.auxiliaryModelSelection !== oldVal.auxiliaryModelSelection ||
        newVal.provider !== oldVal.provider ||
        newVal.model !== oldVal.model ||
        newVal.providers !== oldVal.providers;
      if (relevant) {
        log("relevant config changed, invalidating client cache");
        this.cachedClient = null;
        this.cachedProviderId = null;
      }
    });
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cachedClient = null;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.resolveForCall();
      return true;
    } catch {
      return false;
    }
  }

  async query(prompt: string, opts?: LlmQueryOptions): Promise<string> {
    const result = await this.queryMessages([{ role: "user", content: prompt }], opts);
    return result.content;
  }

  async queryMessages(messages: LlmMessage[], opts?: LlmQueryOptions): Promise<LlmQueryResult> {
    const { provider, model } = await this.resolveForCall(opts?.model);

    const client = this.getOrCreateClient(provider);
    const maxTokens = opts?.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = opts?.temperature ?? DEFAULT_TEMPERATURE;

    log(
      "queryMessages: provider=%s model=%s maxTokens=%d temperature=%s messages=%d",
      provider.id,
      model,
      maxTokens,
      temperature,
      messages.length,
    );

    const response = await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        ...(opts?.system ? { system: opts.system } : {}),
      },
      opts?.signal ? { signal: opts.signal } : undefined,
    );

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      content,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      stopReason: response.stop_reason ?? "unknown",
    };
  }

  /**
   * Resolve provider + model for a call.
   *
   * Fallback chain:
   * 1. Explicit auxiliaryModelSelection -> custom provider
   * 2. No selection -> primary model config:
   *    a. Global selection has provider -> reuse that provider
   *    b. SDK Default -> resolveSDKDefaultCredentials()
   */
  private async resolveForCall(modelOverride?: string): Promise<{
    provider: { id: string; apiKey: string; baseURL: string };
    model: string;
  }> {
    // 1. Explicit auxiliary selection
    const explicit = this.resolveExplicitSelection();
    if (explicit) {
      const model =
        modelOverride ??
        explicit.model ??
        explicit.provider.modelMap.model ??
        Object.keys(explicit.provider.models)[0];
      if (!model) {
        throw new Error(`No model available for provider "${explicit.provider.name}".`);
      }
      return {
        provider: {
          id: explicit.provider.id,
          apiKey: explicit.provider.apiKey,
          baseURL: explicit.provider.baseURL,
        },
        model,
      };
    }

    // 2. Fallback to primary model config
    return this.resolvePrimaryFallback(modelOverride);
  }

  /** Decode explicit auxiliaryModelSelection. Returns null if empty or provider unavailable. */
  private resolveExplicitSelection(): {
    provider: NonNullable<ReturnType<ConfigStore["getProvider"]>>;
    model: string | null;
  } | null {
    const selection = this.configStore.get("auxiliaryModelSelection");
    const { providerId, model } = decodeSelection(selection);
    if (!providerId) return null;

    const provider = this.configStore.getProvider(providerId);
    if (!provider?.enabled) {
      throw new Error(`Auxiliary LLM provider "${providerId}" is not available or disabled.`);
    }
    return { provider, model };
  }

  /** Fallback to primary AI model config (global selection or SDK Default). */
  private async resolvePrimaryFallback(modelOverride?: string): Promise<{
    provider: { id: string; apiKey: string; baseURL: string };
    model: string;
  }> {
    const globalSel = this.configStore.getGlobalSelection();

    // 2a. Primary uses a custom provider
    if (globalSel.provider) {
      const provider = this.configStore.getProvider(globalSel.provider);
      if (!provider?.enabled) {
        throw new Error(
          `Auxiliary LLM provider "${globalSel.provider}" is not available or disabled.`,
        );
      }
      const model =
        modelOverride ??
        globalSel.model ??
        provider.modelMap.model ??
        Object.keys(provider.models)[0];
      if (!model) {
        throw new Error(`No model available for provider "${provider.name}".`);
      }
      return {
        provider: { id: provider.id, apiKey: provider.apiKey, baseURL: provider.baseURL },
        model,
      };
    }

    // 2b. SDK Default — resolve credentials from env
    const creds = await this.resolveSDKDefaultCredentials();
    if (!creds) {
      throw new Error(
        "Auxiliary LLM not available. Primary model uses SDK Default without ANTHROPIC_BASE_URL. " +
          "Configure a custom provider in Settings > Providers, or set ANTHROPIC_BASE_URL in your environment.",
      );
    }

    // Resolve model: override > primary model from settings
    const model = modelOverride ?? this.resolvePrimaryModel();
    if (!model) {
      throw new Error(
        "Auxiliary LLM has credentials but no model configured. " +
          "Set a model in Settings > Chat > Model or in ~/.claude/settings.json.",
      );
    }

    return { provider: { id: "__sdk_default__", ...creds }, model };
  }

  /** Read primary model from configStore global selection or ~/.claude/settings.json. */
  private resolvePrimaryModel(): string | undefined {
    // configStore global model (set via GlobalModelSelect when using SDK Default)
    const globalSel = this.configStore.getGlobalSelection();
    if (globalSel.model) return globalSel.model;

    // ~/.claude/settings.json model field
    const settingsJson = readJsonFile(join(homedir(), ".claude", "settings.json"));
    if (typeof settingsJson?.model === "string" && settingsJson.model) {
      return settingsJson.model;
    }

    return undefined;
  }

  /**
   * Resolve SDK Default credentials from ~/.claude/settings.json env section
   * and shell environment. settings.json env takes priority.
   */
  private async resolveSDKDefaultCredentials(): Promise<{
    baseURL: string;
    apiKey: string;
  } | null> {
    // Source 1: ~/.claude/settings.json env section
    const settingsJson = readJsonFile(join(homedir(), ".claude", "settings.json"));
    const settingsEnv =
      settingsJson?.env && typeof settingsJson.env === "object"
        ? (settingsJson.env as Record<string, string>)
        : {};

    // Source 2: shell environment
    const shellEnv = await this.shellService.getEnv();

    // Merge: settings.json takes priority
    const baseURL = settingsEnv.ANTHROPIC_BASE_URL || shellEnv.ANTHROPIC_BASE_URL;
    const apiKey = settingsEnv.ANTHROPIC_API_KEY || shellEnv.ANTHROPIC_API_KEY;

    if (!baseURL) return null;

    log("resolveSDKDefaultCredentials: baseURL=%s apiKey=%s", baseURL, apiKey ? "(set)" : "(none)");
    return { baseURL, apiKey: apiKey ?? "" };
  }

  private getOrCreateClient(provider: { id: string; apiKey: string; baseURL: string }): Anthropic {
    if (this.cachedClient && this.cachedProviderId === provider.id) {
      return this.cachedClient;
    }

    log("creating Anthropic client: provider=%s baseURL=%s", provider.id, provider.baseURL);
    this.cachedClient = new Anthropic({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
    });
    this.cachedProviderId = provider.id;
    return this.cachedClient;
  }
}
