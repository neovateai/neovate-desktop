import type { ProviderTemplate } from "./built-in";
import type { Provider, ProviderModelEntry, ProviderModelMap } from "./types";

/**
 * Returns template models that are not in the provider and not dismissed.
 */
export function getNewTemplateModels(
  provider: Provider,
  template: ProviderTemplate,
): Record<string, ProviderModelEntry> {
  const dismissed = new Set(provider.dismissedSyncModels ?? []);
  const result: Record<string, ProviderModelEntry> = {};
  for (const [id, entry] of Object.entries(template.models)) {
    if (!(id in provider.models) && !dismissed.has(id)) {
      result[id] = { ...entry };
    }
  }
  return result;
}

/**
 * Returns modelMap slots where the template's value differs from the provider's
 * and the template's target model exists in the provider's models.
 */
export function getModelMapDrift(
  provider: Provider,
  template: ProviderTemplate,
): Partial<ProviderModelMap> {
  const result: Partial<ProviderModelMap> = {};
  for (const slot of ["model", "haiku", "opus", "sonnet"] as const) {
    const templateVal = template.modelMap[slot];
    if (!templateVal) continue;
    if (templateVal === provider.modelMap[slot]) continue;
    if (templateVal in provider.models) {
      result[slot] = templateVal;
    }
  }
  return result;
}
