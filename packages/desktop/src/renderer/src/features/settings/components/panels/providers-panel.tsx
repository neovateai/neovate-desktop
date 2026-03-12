import {
  AlertCircle,
  CheckCircle,
  Clock,
  Edit2,
  Gauge,
  Plus,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  BenchmarkResult,
  Provider,
  ProviderModelMap,
} from "../../../../../../shared/features/provider/types";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../../../components/ui/alert-dialog";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Switch } from "../../../../components/ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../../../components/ui/tooltip";
import { BenchmarkButton } from "../../../provider/benchmark-button";
import { BenchmarkMetrics } from "../../../provider/benchmark-metrics";
import {
  formatMs,
  formatTps,
  getTpsColorClass,
  getTtftColorClass,
} from "../../../provider/benchmark-utils";
import { useProviderStore } from "../../../provider/store";

type ProviderFormData = {
  name: string;
  baseURL: string;
  apiKey: string;
  models: Record<string, { displayName?: string }>;
  modelMap: ProviderModelMap;
  envOverrides: Record<string, string>;
  enabled: boolean;
};

const emptyForm: ProviderFormData = {
  name: "",
  baseURL: "",
  apiKey: "",
  models: {},
  modelMap: {},
  envOverrides: {},
  enabled: true,
};

function providerToForm(p: Provider): ProviderFormData {
  return {
    name: p.name,
    baseURL: p.baseURL,
    apiKey: p.apiKey,
    models: { ...p.models },
    modelMap: { ...p.modelMap },
    envOverrides: { ...p.envOverrides },
    enabled: p.enabled,
  };
}

export const ProvidersPanel = () => {
  const { t } = useTranslation();
  const providers = useProviderStore((s) => s.providers);
  const loaded = useProviderStore((s) => s.loaded);
  const load = useProviderStore((s) => s.load);
  const addProvider = useProviderStore((s) => s.addProvider);
  const updateProvider = useProviderStore((s) => s.updateProvider);
  const removeProvider = useProviderStore((s) => s.removeProvider);
  const benchmarkResults = useProviderStore((s) => s.benchmarkResults);
  const benchmarkingModels = useProviderStore((s) => s.benchmarkingModels);
  const benchmarkModel = useProviderStore((s) => s.benchmarkModel);
  const clearProviderBenchmarkResults = useProviderStore((s) => s.clearProviderBenchmarkResults);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<ProviderFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  // All models in the form can be tested (including newly added ones)
  // Backend will validate if the model exists
  const testableModelIds = useMemo(() => {
    return editingId ? Object.keys(form.models) : [];
  }, [editingId, form.models]);

  // Model list editing state
  const [newModelKey, setNewModelKey] = useState("");
  const [newModelDisplay, setNewModelDisplay] = useState("");

  // Env overrides editing state
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const startCreate = useCallback(() => {
    setEditingId(null);
    setIsCreating(true);
    setForm(emptyForm);
    setError(null);
    // Clear all benchmark results when entering create mode
    // (though there's no providerId yet, this ensures clean state)
    useProviderStore.setState((state) => {
      state.benchmarkResults = {};
    });
  }, []);

  const startEdit = useCallback(
    (p: Provider) => {
      // Clear benchmark results for this provider when entering edit mode
      // Benchmark results should not persist across sessions
      clearProviderBenchmarkResults(p.id);
      setEditingId(p.id);
      setIsCreating(false);
      setForm(providerToForm(p));
      setError(null);
    },
    [clearProviderBenchmarkResults],
  );

  const cancel = useCallback(() => {
    setEditingId(null);
    setIsCreating(false);
    setError(null);
  }, []);

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required";
    try {
      new URL(form.baseURL);
    } catch {
      return "Invalid base URL";
    }
    if (!form.apiKey.trim()) return "API key is required";
    if (Object.keys(form.models).length === 0) return "At least one model is required";
    for (const [slot, modelId] of Object.entries(form.modelMap)) {
      if (modelId && !(modelId in form.models)) {
        return `Model map "${slot}" references "${modelId}" which is not in models`;
      }
    }
    return null;
  };

  const handleSave = useCallback(async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    try {
      if (isCreating) {
        await addProvider({
          name: form.name.trim(),
          baseURL: form.baseURL.trim(),
          apiKey: form.apiKey.trim(),
          models: form.models,
          modelMap: form.modelMap,
          envOverrides: Object.keys(form.envOverrides).length > 0 ? form.envOverrides : undefined,
        });
      } else if (editingId) {
        await updateProvider(editingId, {
          name: form.name.trim(),
          baseURL: form.baseURL.trim(),
          apiKey: form.apiKey.trim(),
          models: form.models,
          modelMap: form.modelMap,
          envOverrides: form.envOverrides,
          enabled: form.enabled,
        });
      }
      cancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }, [form, isCreating, editingId, addProvider, updateProvider, cancel]);

  const handleDeleteClick = useCallback((id: string) => {
    setProviderToDelete(id);
    setDeleteConfirmOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!providerToDelete) return;
    try {
      await removeProvider(providerToDelete);
      if (editingId === providerToDelete) cancel();
      setDeleteConfirmOpen(false);
      setProviderToDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }, [editingId, providerToDelete, removeProvider, cancel]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false);
    setProviderToDelete(null);
  }, []);

  const handleToggle = useCallback(
    async (p: Provider) => {
      try {
        await updateProvider(p.id, { enabled: !p.enabled });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to toggle");
      }
    },
    [updateProvider],
  );

  const addModel = useCallback(() => {
    if (!newModelKey.trim()) return;
    setForm((f) => ({
      ...f,
      models: {
        ...f.models,
        [newModelKey.trim()]: newModelDisplay.trim() ? { displayName: newModelDisplay.trim() } : {},
      },
    }));
    setNewModelKey("");
    setNewModelDisplay("");
  }, [newModelKey, newModelDisplay]);

  const removeModel = useCallback((key: string) => {
    setForm((f) => {
      const models = { ...f.models };
      delete models[key];
      // Clean up modelMap references
      const modelMap = { ...f.modelMap };
      for (const [slot, val] of Object.entries(modelMap)) {
        if (val === key) delete modelMap[slot as keyof ProviderModelMap];
      }
      return { ...f, models, modelMap };
    });
  }, []);

  const addEnvOverride = useCallback(() => {
    if (!newEnvKey.trim()) return;
    setForm((f) => ({
      ...f,
      envOverrides: { ...f.envOverrides, [newEnvKey.trim()]: newEnvValue },
    }));
    setNewEnvKey("");
    setNewEnvValue("");
  }, [newEnvKey, newEnvValue]);

  const removeEnvOverride = useCallback((key: string) => {
    setForm((f) => {
      const envOverrides = { ...f.envOverrides };
      delete envOverrides[key];
      return { ...f, envOverrides };
    });
  }, []);

  const handleBenchmark = useCallback(
    async (providerId: string, modelId: string) => {
      try {
        await benchmarkModel(providerId, modelId);
      } catch (e) {
        // Error is already stored in benchmarkResults
        console.error("Benchmark failed:", e);
      }
    },
    [benchmarkModel],
  );

  const handleBenchmarkAll = useCallback(
    async (providerId: string, modelIds: string[]) => {
      // Run all benchmarks in parallel
      await Promise.all(modelIds.map((modelId) => handleBenchmark(providerId, modelId)));
    },
    [handleBenchmark],
  );

  const isEditing = isCreating || editingId !== null;
  const modelKeys = Object.keys(form.models);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 flex items-center gap-2 text-foreground">
        <Server className="size-[22px]" />
        {t("settings.providers")}
      </h1>

      {!isEditing && (
        <div className="space-y-4">
          {providers.map((p) => (
            <div key={p.id} className="border rounded-lg p-4 space-y-3">
              {/* Provider Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{p.name}</h3>
                  <p className="text-sm text-muted-foreground">{p.baseURL}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={() => handleToggle(p)}
                    title={
                      p.enabled ? t("settings.providers.disable") : t("settings.providers.enable")
                    }
                  />
                  {/* Test All Models Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleBenchmarkAll(p.id, Object.keys(p.models))}
                    disabled={Object.keys(p.models).some((modelKey) =>
                      benchmarkingModels.has(`${p.id}:${modelKey}`),
                    )}
                    title={t("settings.providers.benchmarkAll")}
                  >
                    {Object.keys(p.models).some((modelKey) =>
                      benchmarkingModels.has(`${p.id}:${modelKey}`),
                    ) ? (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <Gauge className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => startEdit(p)}
                    title={t("settings.providers.edit")}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <AlertDialog open={deleteConfirmOpen && providerToDelete === p.id}>
                    <AlertDialogTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDeleteClick(p.id)}
                          title={t("settings.providers.delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <AlertDialogPopup>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("settings.providers.deleteConfirmTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("settings.providers.deleteConfirmDescription", { name: p.name })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogClose
                          render={
                            <Button variant="outline" size="sm" onClick={handleCancelDelete}>
                              {t("common.cancel")}
                            </Button>
                          }
                        />
                        <Button variant="destructive" size="sm" onClick={handleConfirmDelete}>
                          {t("common.delete")}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogPopup>
                  </AlertDialog>
                </div>
              </div>

              {/* Models List with Benchmark */}
              <div className="space-y-2 pl-4 border-l-2 border-muted">
                {Object.entries(p.models).map(([modelKey, modelEntry]) => {
                  const benchmarkKey = `${p.id}:${modelKey}`;
                  const benchmarkResult = benchmarkResults[benchmarkKey];
                  const isBenchmarking = benchmarkingModels.has(benchmarkKey);

                  return (
                    <div key={modelKey} className="flex items-center gap-2 text-sm group/model">
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{modelKey}</code>
                      {modelEntry.displayName && (
                        <span className="text-muted-foreground text-xs">
                          {modelEntry.displayName}
                        </span>
                      )}

                      {/* Benchmark Results */}
                      {benchmarkResult && benchmarkResult.success && (
                        <BenchmarkMetrics
                          ttftMs={benchmarkResult.ttftMs}
                          tpot={benchmarkResult.tpot}
                          tps={benchmarkResult.tps}
                          size="sm"
                        />
                      )}

                      {/* Benchmark Error */}
                      {benchmarkResult && !benchmarkResult.success && (
                        <div className="flex items-center gap-1 text-destructive text-xs">
                          <AlertCircle className="h-3 w-3" />
                          <span className="truncate max-w-[80px]" title={benchmarkResult.error}>
                            Failed
                          </span>
                        </div>
                      )}

                      {/* Benchmark Loading */}
                      {isBenchmarking && (
                        <div className="flex items-center gap-1 text-muted-foreground text-xs">
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          <span>Testing...</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {providers.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">{t("settings.providers.empty")}</p>
          )}
          <div className="pt-4">
            <Button variant="outline" size="sm" onClick={startCreate}>
              <Plus className="h-4 w-4 mr-1" />
              {t("settings.providers.add")}
            </Button>
          </div>
        </div>
      )}

      {isEditing && (
        <div className="space-y-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {/* ID (read-only, only when editing) */}
          {editingId && (
            <div>
              <label className="text-sm font-medium">ID</label>
              <Input value={editingId} disabled className="mt-1 opacity-60" />
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-sm font-medium">{t("settings.providers.name")}</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="OpenRouter"
              className="mt-1"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="text-sm font-medium">{t("settings.providers.baseURL")}</label>
            <Input
              value={form.baseURL}
              onChange={(e) => setForm((f) => ({ ...f, baseURL: e.target.value }))}
              placeholder="https://openrouter.ai/api"
              className="mt-1"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="text-sm font-medium">{t("settings.providers.apiKey")}</label>
            <Input
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="sk-..."
              className="mt-1"
            />
          </div>

          {/* Enabled */}
          {editingId && (
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t("settings.providers.enabled")}</label>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
          )}

          {/* Models */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t("settings.providers.models")}</label>
              {editingId && (
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger>
                      <BenchmarkButton
                        providerId={editingId}
                        modelIds={testableModelIds}
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onBeforeBenchmark={async () => {
                          // Save provider first to ensure all models (including newly added) are persisted
                          if (editingId) {
                            await updateProvider(editingId, {
                              models: form.models,
                              modelMap: form.modelMap,
                            });
                          }
                        }}
                      />
                    </TooltipTrigger>
                    {(() => {
                      const results = Object.fromEntries(
                        Object.keys(form.models)
                          .map((modelKey) => {
                            const key = `${editingId}:${modelKey}`;
                            const result = benchmarkResults[key];
                            return result ? [modelKey, result] : null;
                          })
                          .filter((entry): entry is [string, BenchmarkResult] => entry !== null),
                      );
                      return Object.keys(results).length > 0 ? (
                        <TooltipPopup className="max-w-sm p-3" side="top" align="end">
                          <div className="space-y-2">
                            <div className="font-medium text-sm border-b pb-1">
                              {t("settings.providers.benchmarkResults")}
                            </div>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                              {Object.entries(results).map(([modelId, result]) => (
                                <div key={modelId} className="text-xs space-y-1">
                                  <div className="font-mono font-medium text-foreground">
                                    {modelId}
                                  </div>
                                  {result.success ? (
                                    <div className="space-y-1 pl-2">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded ${getTtftColorClass(result.ttftMs)}`}
                                        >
                                          <Clock className="h-3 w-3" />
                                          TTFT: {formatMs(result.ttftMs)}
                                        </span>
                                        <span
                                          className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded ${getTpsColorClass(result.tps)}`}
                                        >
                                          <Gauge className="h-3 w-3" />
                                          TPS: {formatTps(result.tps)}
                                        </span>
                                      </div>
                                      <div className="text-muted-foreground">
                                        {t("settings.providers.benchmark.totalTime")}:{" "}
                                        {formatMs(result.totalTimeMs)} |{" "}
                                        {t("settings.providers.benchmark.tokens")}:{" "}
                                        {result.tokensGenerated}
                                      </div>
                                      <div className="flex items-center gap-1 text-green-500">
                                        <CheckCircle className="h-3 w-3" />
                                        {t("settings.providers.benchmark.status")}: Success
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="pl-2 space-y-1">
                                      <div className="flex items-center gap-1 text-destructive">
                                        <AlertCircle className="h-3 w-3" />
                                        {t("settings.providers.benchmark.status")}: Failed
                                      </div>
                                      {result.error && (
                                        <div
                                          className="text-destructive/80 truncate max-w-[200px]"
                                          title={result.error}
                                        >
                                          {result.error}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </TooltipPopup>
                      ) : null;
                    })()}
                  </Tooltip>
                </div>
              )}
            </div>
            <div className="mt-1 space-y-1">
              {Object.entries(form.models).map(([key, entry]) => {
                const benchmarkKey = editingId ? `${editingId}:${key}` : null;
                const benchmarkResult = benchmarkKey ? benchmarkResults[benchmarkKey] : null;
                const isBenchmarking = benchmarkKey ? benchmarkingModels.has(benchmarkKey) : false;

                return (
                  <div key={key} className="flex items-center gap-2 text-sm group/model">
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{key}</code>
                    {entry.displayName && (
                      <span className="text-muted-foreground">{entry.displayName}</span>
                    )}

                    {/* Benchmark Results */}
                    {benchmarkResult && benchmarkResult.success && (
                      <BenchmarkMetrics
                        ttftMs={benchmarkResult.ttftMs}
                        tpot={benchmarkResult.tpot}
                        tps={benchmarkResult.tps}
                        size="sm"
                      />
                    )}

                    {/* Benchmark Error */}
                    {benchmarkResult && !benchmarkResult.success && (
                      <div className="flex items-center gap-1 text-destructive text-xs">
                        <AlertCircle className="h-3 w-3" />
                        <span className="truncate max-w-[120px]" title={benchmarkResult.error}>
                          Failed
                        </span>
                      </div>
                    )}

                    {/* Benchmark Loading */}
                    {isBenchmarking && (
                      <div className="flex items-center gap-1 text-muted-foreground text-xs">
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        <span>Testing...</span>
                      </div>
                    )}

                    <button
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      onClick={() => removeModel(key)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 pt-1">
                <Input
                  value={newModelKey}
                  onChange={(e) => setNewModelKey(e.target.value)}
                  placeholder={t("settings.providers.modelId")}
                  className="flex-1 h-7 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && addModel()}
                />
                <Input
                  value={newModelDisplay}
                  onChange={(e) => setNewModelDisplay(e.target.value)}
                  placeholder={t("settings.providers.displayName")}
                  className="flex-1 h-7 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && addModel()}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addModel}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Model Map */}
          <div>
            <label className="text-sm font-medium">{t("settings.providers.modelMap")}</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["model", "haiku", "opus", "sonnet"] as const).map((slot) => (
                <div key={slot}>
                  <label className="text-xs text-muted-foreground capitalize">{slot}</label>
                  <select
                    value={form.modelMap[slot] ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        modelMap: {
                          ...f.modelMap,
                          [slot]: e.target.value || undefined,
                        },
                      }))
                    }
                    className="w-full h-7 text-xs bg-background border border-input rounded-md px-2"
                  >
                    <option value="">--</option>
                    {modelKeys.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Env Overrides */}
          <div>
            <label className="text-sm font-medium">{t("settings.providers.envOverrides")}</label>
            <div className="mt-1 space-y-1">
              {Object.entries(form.envOverrides).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{key}</code>
                  <span className="text-muted-foreground text-xs truncate">
                    {value || "(delete)"}
                  </span>
                  <button
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    onClick={() => removeEnvOverride(key)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <Input
                  value={newEnvKey}
                  onChange={(e) => setNewEnvKey(e.target.value)}
                  placeholder="ENV_VAR"
                  className="flex-1 h-7 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && addEnvOverride()}
                />
                <Input
                  value={newEnvValue}
                  onChange={(e) => setNewEnvValue(e.target.value)}
                  placeholder="value"
                  className="flex-1 h-7 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && addEnvOverride()}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addEnvOverride}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={handleSave}>
              {isCreating ? t("settings.providers.create") : t("settings.providers.save")}
            </Button>
            <Button variant="outline" size="sm" onClick={cancel}>
              {t("settings.providers.cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
