import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import type {
  ProviderFilter as ProviderFilterType,
  ModelFilter as ModelFilterType,
} from "../store";

import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { useProviderStore } from "../../provider/store";
import { useUsageStore } from "../store";

export function UsageFilters() {
  const { t } = useTranslation();

  // Provider store
  const providers = useProviderStore((s) => s.providers);
  const loaded = useProviderStore((s) => s.loaded);
  const load = useProviderStore((s) => s.load);

  // Usage store filters
  const providerFilter = useUsageStore((s) => s.providerFilter);
  const modelFilter = useUsageStore((s) => s.modelFilter);
  const setProviderFilter = useUsageStore((s) => s.setProviderFilter);
  const setModelFilter = useUsageStore((s) => s.setModelFilter);

  // Load providers on mount
  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  // Only show enabled providers
  const enabledProviders = useMemo(() => providers.filter((p) => p.enabled), [providers]);

  // Get models for the selected provider
  const availableModels = useMemo(() => {
    if (providerFilter === "all") {
      // Aggregate all models from all providers
      const modelMap = new Map<string, string>();
      for (const provider of enabledProviders) {
        for (const [modelId, config] of Object.entries(provider.models)) {
          if (!modelMap.has(modelId)) {
            modelMap.set(modelId, config.displayName || modelId);
          }
        }
      }
      return Array.from(modelMap.entries()).map(([id, name]) => ({ id, name }));
    }

    const provider = enabledProviders.find((p) => p.id === providerFilter);
    if (!provider) return [];

    return Object.entries(provider.models).map(([id, config]) => ({
      id,
      name: config.displayName || id,
    }));
  }, [providerFilter, enabledProviders]);

  // Build provider options: "all" + enabled providers
  const providerOptions: { value: ProviderFilterType; label: string }[] = [
    { value: "all", label: t("usage.filter.allProviders") },
    ...enabledProviders.map((p) => ({ value: p.id, label: p.name })),
  ];

  // Build model options: "all" + available models
  const modelOptions: { value: ModelFilterType; label: string }[] = [
    { value: "all", label: t("usage.filter.allModels") },
    ...availableModels.map((m) => ({ value: m.id, label: m.name })),
  ];

  // Handlers for Select
  const handleProviderChange = (value: string | null) => {
    setProviderFilter((value ?? "all") as ProviderFilterType);
  };

  const handleModelChange = (value: string | null) => {
    setModelFilter((value ?? "all") as ModelFilterType);
  };

  // Don't render if no providers configured
  if (enabledProviders.length === 0) {
    return null;
  }

  // Custom trigger class to match TimeRangeTabs height (h-8 with p-1 = inner h-6)
  const triggerClass = "h-[30px] w-auto min-w-[100px] text-xs";

  return (
    <div className="flex items-center gap-2">
      {/* Provider Filter */}
      <Select value={providerFilter} onValueChange={handleProviderChange}>
        <SelectTrigger size="sm" className={triggerClass}>
          <SelectValue placeholder={t("usage.filter.allProviders")} />
        </SelectTrigger>
        <SelectPopup>
          {providerOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>

      {/* Model Filter - only show if there are models */}
      {availableModels.length > 0 && (
        <Select value={modelFilter} onValueChange={handleModelChange}>
          <SelectTrigger size="sm" className={triggerClass}>
            <SelectValue placeholder={t("usage.filter.allModels")} />
          </SelectTrigger>
          <SelectPopup>
            {modelOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      )}
    </div>
  );
}
