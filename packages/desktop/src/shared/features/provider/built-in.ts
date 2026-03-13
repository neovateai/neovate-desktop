import type { ProviderModelMap } from "./types";

export type BuiltInProvider = {
  id: string;
  nameKey: string;
  name: string;
  baseURL: string;
  apiKeyURL?: string;
  models: Record<string, { displayName?: string }>;
  modelMap: ProviderModelMap;
  envOverrides: Record<string, string>;
};

export const BUILT_IN_PROVIDERS: BuiltInProvider[] = [
  {
    id: "openrouter",
    nameKey: "providers.openrouter.name",
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api",
    apiKeyURL: "https://openrouter.ai/settings/keys",
    models: {
      "anthropic/claude-opus-4.6": { displayName: "Claude Opus 4.6" },
      "anthropic/claude-sonnet-4.6": { displayName: "Claude Sonnet 4.6" },
      "anthropic/claude-haiku-4.5": { displayName: "Claude Haiku 4.5" },
    },
    modelMap: {
      model: "anthropic/claude-opus-4.6",
      sonnet: "anthropic/claude-sonnet-4.6",
      haiku: "anthropic/claude-haiku-4.5",
      opus: "anthropic/claude-opus-4.6",
    },
    envOverrides: {},
  },
];

export function getBuiltInProvider(builtInId: string): BuiltInProvider | undefined {
  return BUILT_IN_PROVIDERS.find((t) => t.id === builtInId);
}
