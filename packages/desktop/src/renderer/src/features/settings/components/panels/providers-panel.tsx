import debug from "debug";
import {
  AlertCircle,
  Check,
  Copy,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Provider, ProviderModelMap } from "../../../../../../shared/features/provider/types";

import {
  resolveL10n,
  type ProviderBadgeType,
  type ProviderTemplate,
} from "../../../../../../shared/features/provider/built-in";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../../../../components/ui/alert-dialog";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { Spinner } from "../../../../components/ui/spinner";
import { Switch } from "../../../../components/ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../../../components/ui/tooltip";
import { useRendererApp } from "../../../../core/app";
import { cn } from "../../../../lib/utils";
import { BenchmarkButton } from "../../../provider/benchmark-button";
import { BenchmarkMetrics } from "../../../provider/benchmark-metrics";
import { BenchmarkTooltipContent } from "../../../provider/benchmark-tooltip";
import { useProviderStore } from "../../../provider/store";
import { SettingsRow } from "../settings-row";

const log = debug("neovate:settings:providers");

type ProviderFormData = {
  name: string;
  baseURL: string;
  apiKey: string;
  models: Record<string, { displayName?: string }>;
  modelMap: ProviderModelMap;
  envOverrides: Record<string, string>;
  enabled: boolean;
  builtInId?: string;
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

const badgeVariantMap: Record<ProviderBadgeType, "success" | "info" | "default" | "warning"> = {
  recommended: "success",
  internal: "info",
  new: "default",
  deprecated: "warning",
};

const badgeSortPriority: Record<ProviderBadgeType, number> = {
  internal: 1,
  recommended: 2,
  new: 3,
  deprecated: 5,
};

const NO_BADGE_PRIORITY = 4;

function getTemplateSortPriority(t: ProviderTemplate): number {
  if (!t.badges || t.badges.length === 0) return NO_BADGE_PRIORITY;
  return Math.min(...t.badges.map((b) => badgeSortPriority[b]));
}

function providerToForm(p: Provider): ProviderFormData {
  return {
    name: p.name,
    baseURL: p.baseURL,
    apiKey: p.apiKey,
    models: { ...p.models },
    modelMap: { ...p.modelMap },
    envOverrides: { ...p.envOverrides },
    enabled: p.enabled,
    builtInId: p.builtInId,
  };
}

function builtInToForm(t: ProviderTemplate, lang: string): ProviderFormData {
  return {
    name: resolveL10n(t.name, lang, t.nameLocalized),
    baseURL: t.baseURL,
    apiKey: "",
    models: { ...t.models },
    modelMap: { ...t.modelMap },
    envOverrides: { ...t.envOverrides },
    enabled: true,
    builtInId: t.id,
  };
}

export const ProvidersPanel = () => {
  const { t, i18n } = useTranslation();
  const providerTemplates = useRendererApp().pluginManager.contributions.providerTemplates;
  const providers = useProviderStore((s) => s.providers);
  const loaded = useProviderStore((s) => s.loaded);
  const load = useProviderStore((s) => s.load);
  const addProvider = useProviderStore((s) => s.addProvider);
  const updateProvider = useProviderStore((s) => s.updateProvider);
  const removeProvider = useProviderStore((s) => s.removeProvider);
  const benchmarkResults = useProviderStore((s) => s.benchmarkResults);
  const benchmarkingModels = useProviderStore((s) => s.benchmarkingModels);
  const cancelBenchmarks = useProviderStore((s) => s.cancelBenchmarks);
  const clearBenchmarkResults = useProviderStore((s) => s.clearBenchmarkResults);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [form, setForm] = useState<ProviderFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  // API key visibility state
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);

  // Model list editing state
  const [newModelKey, setNewModelKey] = useState("");
  const [newModelDisplay, setNewModelDisplay] = useState("");

  // Env overrides editing state
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null);

  // Reset confirmation state
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  // Cancel in-flight benchmarks when leaving the providers panel
  useEffect(() => {
    return () => cancelBenchmarks();
  }, [cancelBenchmarks]);

  const usedBuiltInIds = useMemo(
    () => new Set(providers.map((p) => p.builtInId).filter(Boolean)),
    [providers],
  );

  const sortedTemplates = useMemo(
    () =>
      [...providerTemplates].sort(
        (a, b) => getTemplateSortPriority(a) - getTemplateSortPriority(b),
      ),
    [providerTemplates],
  );

  const canCheck = useMemo(() => {
    try {
      new URL(form.baseURL);
      return form.apiKey.trim() !== "" && Object.keys(form.models).length > 0;
    } catch {
      return false;
    }
  }, [form.baseURL, form.apiKey, form.models]);

  const startCreate = useCallback(() => {
    setEditingId(null);
    setError(null);
    setShowApiKey(false);
    setShowTemplatePicker(true);
    setIsCreating(false);
    useProviderStore.setState((state) => {
      state.benchmarkResults = {};
    });
  }, []);

  const selectTemplate = useCallback((template: ProviderTemplate) => {
    setShowTemplatePicker(false);
    setIsCreating(true);
    setShowApiKey(false);
    setForm(builtInToForm(template, i18n.language));
  }, []);

  const selectCustom = useCallback(() => {
    setShowTemplatePicker(false);
    setIsCreating(true);
    setShowApiKey(false);
    setForm(emptyForm);
  }, []);

  const startEdit = useCallback(
    (p: Provider) => {
      clearBenchmarkResults(p.baseURL);
      setEditingId(p.id);
      setIsCreating(false);
      setShowApiKey(false);
      setForm(providerToForm(p));
      setError(null);
    },
    [clearBenchmarkResults],
  );

  const cancel = useCallback(() => {
    setEditingId(null);
    setIsCreating(false);
    setShowTemplatePicker(false);
    setShowApiKey(false);
    setError(null);
  }, []);

  const handleCopyApiKey = useCallback(() => {
    if (!form.apiKey) return;
    navigator.clipboard.writeText(form.apiKey);
    setApiKeyCopied(true);
    setTimeout(() => setApiKeyCopied(false), 2000);
  }, [form.apiKey]);

  const handleApiKeyBlur = useCallback(() => {
    setShowApiKey(false);
  }, []);

  const validate = (): string | null => {
    if (!form.name.trim()) return t("settings.providers.validation.nameRequired");
    try {
      new URL(form.baseURL);
    } catch {
      return t("settings.providers.validation.invalidURL");
    }
    if (!form.apiKey.trim()) return t("settings.providers.validation.apiKeyRequired");
    if (Object.keys(form.models).length === 0)
      return t("settings.providers.validation.modelRequired");
    for (const [slot, modelId] of Object.entries(form.modelMap)) {
      if (modelId && !(modelId in form.models)) {
        return t("settings.providers.validation.modelMapInvalid", { slot, modelId });
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
    log("saving provider: name=%s isCreating=%s editingId=%s", form.name, isCreating, editingId);
    try {
      if (isCreating) {
        await addProvider({
          name: form.name.trim(),
          baseURL: form.baseURL.trim(),
          apiKey: form.apiKey.trim(),
          models: form.models,
          modelMap: form.modelMap,
          envOverrides: Object.keys(form.envOverrides).length > 0 ? form.envOverrides : undefined,
          builtInId: form.builtInId,
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
      setError(e instanceof Error ? e.message : t("settings.providers.saveFailed"));
    }
  }, [form, isCreating, editingId, addProvider, updateProvider, cancel]);

  const handleDeleteClick = useCallback((id: string) => {
    setProviderToDelete(id);
    setDeleteConfirmOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!providerToDelete) return;
    log("deleting provider: id=%s", providerToDelete);
    try {
      await removeProvider(providerToDelete);
      if (editingId === providerToDelete) cancel();
      setDeleteConfirmOpen(false);
      setProviderToDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.providers.deleteFailed"));
    }
  }, [editingId, providerToDelete, removeProvider, cancel]);

  const handleToggle = useCallback(
    async (p: Provider) => {
      log("toggling provider: id=%s enabled=%s", p.id, !p.enabled);
      try {
        await updateProvider(p.id, { enabled: !p.enabled });
      } catch (e) {
        setError(e instanceof Error ? e.message : t("settings.providers.toggleFailed"));
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

  const handleResetDefaults = useCallback(() => {
    if (!form.builtInId) return;
    setResetConfirmOpen(true);
  }, [form.builtInId]);

  const handleConfirmReset = useCallback(() => {
    if (!form.builtInId) return;
    const template = providerTemplates.find((t) => t.id === form.builtInId);
    if (!template) return;
    setForm((f) => ({
      ...f,
      baseURL: template.baseURL,
      models: { ...template.models },
      modelMap: { ...template.modelMap },
      envOverrides: { ...template.envOverrides },
    }));
    setResetConfirmOpen(false);
  }, [form.builtInId, providerTemplates]);

  const activeBuiltIn = useMemo(
    () => (form.builtInId ? providerTemplates.find((t) => t.id === form.builtInId) : undefined),
    [form.builtInId, providerTemplates],
  );

  const activeApiKeyURL = activeBuiltIn?.apiKeyURL;
  const activeDocURL = activeBuiltIn?.docURL;

  const isEditing = isCreating || editingId !== null;
  const modelKeys = Object.keys(form.models);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-8 flex items-center gap-3 text-foreground">
        <span className="flex items-center justify-center size-9 rounded-xl bg-primary/10">
          <Server className="size-5 text-primary" />
        </span>
        {t("settings.providers")}
      </h1>

      {showTemplatePicker && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">{t("settings.providers.chooseTemplate")}</p>
          <div className="grid grid-cols-3 gap-3">
            {sortedTemplates.map((template) => {
              const hostname = new URL(template.baseURL).hostname;
              const isUsed = usedBuiltInIds.has(template.id);
              const isDeprecated = template.badges?.includes("deprecated") ?? false;
              return (
                <button
                  key={template.id}
                  disabled={isUsed}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-xl border border-border/50 bg-background p-4 text-left transition-all",
                    isUsed
                      ? "opacity-40 cursor-not-allowed"
                      : isDeprecated
                        ? "opacity-60 hover:border-border hover:shadow-sm cursor-pointer"
                        : "hover:border-border hover:shadow-sm cursor-pointer",
                  )}
                  onClick={() => !isUsed && selectTemplate(template)}
                >
                  <span className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                    {resolveL10n(template.name, i18n.language, template.nameLocalized)}
                    {template.badges?.slice(0, 2).map((badge) => (
                      <Badge key={badge} variant={badgeVariantMap[badge]} size="sm">
                        {t(`settings.providers.badge.${badge}`)}
                      </Badge>
                    ))}
                  </span>
                  <span className="text-xs text-muted-foreground line-clamp-2">
                    {resolveL10n(template.description, i18n.language)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 mt-auto">{hostname}</span>
                </button>
              );
            })}
            <button
              className="flex flex-col items-start gap-1.5 rounded-xl border border-dashed border-border/50 bg-background p-4 text-left hover:border-border hover:shadow-sm transition-all cursor-pointer"
              onClick={selectCustom}
            >
              <span className="text-sm font-medium">{t("settings.providers.custom")}</span>
              <span className="text-xs text-muted-foreground">
                {t("settings.providers.customDescription")}
              </span>
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={cancel}>
            {t("settings.providers.cancel")}
          </Button>
        </div>
      )}

      {!isEditing && !showTemplatePicker && (
        <div className="space-y-0 rounded-xl bg-muted/30 border border-border/50 px-5 py-2">
          {providers.map((p) => (
            <SettingsRow key={p.id} title={p.name} description={p.baseURL}>
              <div className="flex items-center gap-2">
                <Switch checked={p.enabled} onCheckedChange={() => handleToggle(p)} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => startEdit(p)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => handleDeleteClick(p.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </SettingsRow>
          ))}
          {providers.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t("settings.providers.empty")}
            </p>
          )}
        </div>
      )}

      {!isEditing && !showTemplatePicker && (
        <div className="mt-5 flex justify-end">
          <Button variant="outline" size="sm" onClick={startCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t("settings.providers.add")}
          </Button>
        </div>
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.providers.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.providers.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t("settings.providers.cancel")}
            </AlertDialogClose>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              {t("common.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.providers.resetDefaults")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.providers.resetConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t("settings.providers.cancel")}
            </AlertDialogClose>
            <Button variant="destructive" onClick={handleConfirmReset}>
              {t("settings.providers.resetDefaults")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

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
              <label className="text-sm font-medium">{t("settings.providers.id")}</label>
              <Input value={editingId} disabled className="mt-1" />
            </div>
          )}

          {/* Name */}
          <label className="block">
            <span className="text-sm font-medium">{t("settings.providers.name")}</span>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="OpenRouter"
              className="mt-1"
            />
          </label>

          {/* Base URL */}
          <label className="block">
            <span className="text-sm font-medium">{t("settings.providers.baseURL")}</span>
            <Input
              value={form.baseURL}
              onChange={(e) => setForm((f) => ({ ...f, baseURL: e.target.value }))}
              placeholder="https://openrouter.ai/api"
              className="mt-1"
            />
          </label>

          {/* API Key */}
          <div>
            <label htmlFor="provider-apikey" className="text-sm font-medium">
              {t("settings.providers.apiKey")}
            </label>
            <div className="mt-1 flex items-center gap-1.5">
              <Input
                id="provider-apikey"
                type={showApiKey ? "text" : "password"}
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                onBlur={handleApiKeyBlur}
                placeholder="sk-..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowApiKey((v) => !v)}
                title={
                  showApiKey
                    ? t("settings.providers.hideApiKey")
                    : t("settings.providers.showApiKey")
                }
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleCopyApiKey}
                disabled={!form.apiKey}
                title={t("settings.providers.copyApiKey")}
              >
                {apiKeyCopied ? (
                  <Check className="h-4 w-4 text-success-foreground" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            {(activeApiKeyURL || activeDocURL) && (
              <div className="flex items-center gap-3 mt-1.5">
                {activeApiKeyURL && (
                  <a
                    href={activeApiKeyURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("settings.providers.getApiKey")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {activeDocURL && (
                  <a
                    href={activeDocURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("settings.providers.viewDocs")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
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
              <span className="text-sm font-medium">{t("settings.providers.models")}</span>
              {canCheck && (
                <BenchmarkButton
                  baseURL={form.baseURL}
                  apiKey={form.apiKey}
                  models={form.models}
                  size="xs"
                  variant="outline"
                />
              )}
            </div>
            <div className="mt-1 space-y-1">
              {Object.entries(form.models).map(([key, entry]) => {
                const benchKey = `${form.baseURL}:${key}`;
                const result = benchmarkResults[benchKey];
                const isRunning = benchmarkingModels[benchKey] ?? false;
                const failed = result && !isRunning && !result.success;

                return (
                  <div key={key}>
                    <div className="flex items-center gap-2 text-sm">
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{key}</code>
                      {entry.displayName && (
                        <span className="text-muted-foreground">{entry.displayName}</span>
                      )}
                      <div className="ml-auto flex items-center gap-1.5">
                        {isRunning && <Spinner className="h-3 w-3" />}
                        {result && !isRunning && result.success && (
                          <Tooltip>
                            <TooltipTrigger className="cursor-default">
                              <BenchmarkMetrics
                                ttftMs={result.ttftMs}
                                tpot={result.tpot}
                                tps={result.tps}
                              />
                            </TooltipTrigger>
                            <TooltipPopup>
                              <BenchmarkTooltipContent result={result} />
                            </TooltipPopup>
                          </Tooltip>
                        )}
                        {failed && (
                          <Badge variant="error" size="sm">
                            <AlertCircle className="h-3 w-3" />
                            {t("settings.providers.benchmark.failed")}
                          </Badge>
                        )}
                        <button
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeModel(key)}
                          aria-label={t("settings.providers.removeModel", { model: key })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {failed && result.error && (
                      <p className="text-xs text-destructive mt-0.5 ml-1 break-all">
                        {result.error}
                      </p>
                    )}
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
            <span className="text-sm font-medium">{t("settings.providers.modelMap")}</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["model", "haiku", "opus", "sonnet"] as const).map((slot) => (
                <div key={slot}>
                  <label className="text-xs text-muted-foreground capitalize">{slot}</label>
                  <Select
                    value={form.modelMap[slot] ?? ""}
                    onValueChange={(val) =>
                      setForm((f) => ({
                        ...f,
                        modelMap: {
                          ...f.modelMap,
                          [slot]: val || undefined,
                        },
                      }))
                    }
                  >
                    <SelectTrigger size="sm" className="w-full mt-1">
                      <SelectValue>{form.modelMap[slot] ?? "--"}</SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="">--</SelectItem>
                      {modelKeys.map((k) => (
                        <SelectItem key={k} value={k}>
                          {k}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {/* Env Overrides */}
          <div>
            <span className="text-sm font-medium">{t("settings.providers.envOverrides")}</span>
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
                    aria-label={t("settings.providers.removeEnvOverride", { key })}
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
            {editingId && form.builtInId && (
              <Button variant="ghost" size="sm" onClick={handleResetDefaults} className="ml-auto">
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                {t("settings.providers.resetDefaults")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
