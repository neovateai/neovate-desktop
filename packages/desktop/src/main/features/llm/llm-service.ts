import { Anthropic } from "@anthropic-ai/sdk";
import debug from "debug";

import type {
  ILlmService,
  LlmMessage,
  LlmQueryOptions,
  LlmQueryResult,
} from "../../../shared/features/llm/types";
import type { ConfigStore } from "../config/config-store";

const log = debug("neovate:llm-service");

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;

/** Decode "providerId:modelId" → { providerId, model }. Same encoding as GlobalModelSelect. */
function decodeSelection(value: string): { providerId: string | null; model: string | null } {
  if (!value) return { providerId: null, model: null };
  const idx = value.indexOf(":");
  const providerId = value.slice(0, idx) || null;
  const model = value.slice(idx + 1) || null;
  return { providerId, model };
}

export class LlmService implements ILlmService {
  private cachedClient: Anthropic | null = null;
  private cachedProviderId: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private configStore: ConfigStore) {
    // Invalidate cached client when auxiliary selection changes
    this.unsubscribe = this.configStore.onChange("auxiliaryModelSelection", () => {
      log("auxiliaryModelSelection changed, invalidating client cache");
      this.cachedClient = null;
      this.cachedProviderId = null;
    });
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cachedClient = null;
  }

  isConfigured(): boolean {
    const { providerId } = this.resolveProviderAndModel();
    return providerId !== null;
  }

  async query(prompt: string, opts?: LlmQueryOptions): Promise<string> {
    const result = await this.queryMessages([{ role: "user", content: prompt }], opts);
    return result.content;
  }

  async queryMessages(messages: LlmMessage[], opts?: LlmQueryOptions): Promise<LlmQueryResult> {
    const { provider, model } = this.resolveForCall(opts?.model);

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

  /** Resolve provider + model, throwing if not available. */
  private resolveForCall(modelOverride?: string): {
    provider: { id: string; apiKey: string; baseURL: string };
    model: string;
  } {
    const { providerId, model: configModel } = this.resolveProviderAndModel();

    if (!providerId) {
      throw new Error(
        "No custom provider configured. Auxiliary LLM requires a provider with API credentials. " +
          "Configure one in Settings > Providers, then select it in Settings > Chat > Auxiliary Model.",
      );
    }

    const provider = this.configStore.getProvider(providerId);
    if (!provider || !provider.enabled) {
      throw new Error(`Auxiliary LLM provider "${providerId}" is not available or disabled.`);
    }

    const model =
      modelOverride ?? configModel ?? provider.modelMap.model ?? Object.keys(provider.models)[0];
    if (!model) {
      throw new Error(`No model available for provider "${provider.name}".`);
    }

    return {
      provider: { id: provider.id, apiKey: provider.apiKey, baseURL: provider.baseURL },
      model,
    };
  }

  /** Decode config selection. No fallback — user must explicitly select a provider + model. */
  private resolveProviderAndModel(): { providerId: string | null; model: string | null } {
    const selection = this.configStore.get("auxiliaryModelSelection");
    const { providerId, model } = decodeSelection(selection);

    if (providerId) {
      const provider = this.configStore.getProvider(providerId);
      if (provider?.enabled) return { providerId, model };
    }

    return { providerId: null, model: null };
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
