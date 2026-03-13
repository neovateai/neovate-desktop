import type { ProviderModelMap } from "./types";

export type L10nText = Record<string, string>;

export type ProviderTemplate = {
  id: string;
  name: string;
  nameLocalized?: L10nText;
  description: L10nText;
  baseURL: string;
  apiKeyURL?: string;
  docURL?: string;
  models: Record<string, { displayName?: string }>;
  modelMap: ProviderModelMap;
  envOverrides: Record<string, string>;
  apiFormat?: "anthropic";
};

/** @deprecated Use `ProviderTemplate` instead */
export type BuiltInProvider = ProviderTemplate;

export function resolveL10n(value: string | L10nText, lang: string, localized?: L10nText): string {
  if (typeof value === "string") return localized?.[lang] ?? value;
  return value[lang] ?? value["en-US"] ?? Object.values(value)[0] ?? "";
}
