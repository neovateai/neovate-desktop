import { Edit2, Plus, Server, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Provider, ProviderModelMap } from "../../../../../../shared/features/provider/types";

import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Switch } from "../../../../components/ui/switch";
import { useProviderStore } from "../../../provider/store";
import { SettingsRow } from "../settings-row";

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<ProviderFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  // Model list editing state
  const [newModelKey, setNewModelKey] = useState("");
  const [newModelDisplay, setNewModelDisplay] = useState("");

  // Env overrides editing state
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const startCreate = useCallback(() => {
    setEditingId(null);
    setIsCreating(true);
    setForm(emptyForm);
    setError(null);
  }, []);

  const startEdit = useCallback((p: Provider) => {
    setEditingId(p.id);
    setIsCreating(false);
    setForm(providerToForm(p));
    setError(null);
  }, []);

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

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await removeProvider(id);
        if (editingId === id) cancel();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete");
      }
    },
    [editingId, removeProvider, cancel],
  );

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

  const isEditing = isCreating || editingId !== null;
  const modelKeys = Object.keys(form.models);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6 flex items-center gap-2 text-foreground">
        <Server className="size-[22px]" />
        {t("settings.providers")}
      </h1>

      {!isEditing && (
        <div className="space-y-0">
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
                  onClick={() => handleDelete(p.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </SettingsRow>
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
            <label className="text-sm font-medium">{t("settings.providers.models")}</label>
            <div className="mt-1 space-y-1">
              {Object.entries(form.models).map(([key, entry]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{key}</code>
                  {entry.displayName && (
                    <span className="text-muted-foreground">{entry.displayName}</span>
                  )}
                  <button
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    onClick={() => removeModel(key)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
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
