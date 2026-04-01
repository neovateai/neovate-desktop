import debug from "debug";
import { ArrowUpCircle, RefreshCw } from "lucide-react";
import { useState } from "react";

import type { InstalledPlugin, PluginUpdate } from "../../../../../shared/features/plugins/types";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Spinner } from "../../../components/ui/spinner";
import { Switch } from "../../../components/ui/switch";
import { client } from "../../../orpc";
import { PluginDetailModal } from "./plugin-detail-modal";

const log = debug("neovate:plugins");

const getInitials = (name: string): string => {
  const words = name.split(/[\s-_]+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

interface InstalledTabProps {
  plugins: InstalledPlugin[];
  updates: PluginUpdate[];
  onRefresh: () => Promise<void>;
}

export const InstalledTab = ({ plugins, updates, onRefresh }: InstalledTabProps) => {
  const [selectedPlugin, setSelectedPlugin] = useState<InstalledPlugin | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [updatingAll, setUpdatingAll] = useState(false);

  const getUpdate = (plugin: InstalledPlugin) =>
    updates.find((u) => u.pluginId === plugin.pluginId && u.scope === plugin.scope);

  const handleToggle = async (plugin: InstalledPlugin) => {
    const key = `${plugin.pluginId}-${plugin.scope}`;
    if (togglingId) return;
    setTogglingId(key);
    log("toggle plugin: %s enabled=%s", plugin.pluginId, !plugin.enabled);
    try {
      if (plugin.enabled) {
        await client.plugins.disable({ pluginId: plugin.pluginId });
      } else {
        await client.plugins.enable({ pluginId: plugin.pluginId });
      }
      await onRefresh();
    } finally {
      setTogglingId(null);
    }
  };

  const handleUpdateAll = async () => {
    setUpdatingAll(true);
    try {
      await client.plugins.updateAll({});
      await onRefresh();
    } finally {
      setUpdatingAll(false);
    }
  };

  if (plugins.length === 0) {
    return (
      <div className="rounded-xl bg-muted/30 border border-border/50 py-8">
        <p className="text-sm text-muted-foreground text-center">
          No plugins installed yet. Browse the Discover tab to find plugins.
        </p>
      </div>
    );
  }

  return (
    <>
      {updates.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground">
            {updates.length} update{updates.length > 1 ? "s" : ""} available
          </span>
          <Button variant="outline" size="sm" onClick={handleUpdateAll} disabled={updatingAll}>
            {updatingAll ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
            Update All
          </Button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {plugins.map((plugin) => {
          const key = `${plugin.pluginId}-${plugin.scope}`;
          const initials = getInitials(plugin.name);
          const update = getUpdate(plugin);
          return (
            <div
              key={key}
              className="group relative flex flex-col p-4 rounded-xl bg-background border border-border/50 cursor-pointer hover:border-border hover:shadow-sm transition-all"
              onClick={() => setSelectedPlugin(plugin)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-muted text-muted-foreground text-sm font-semibold shrink-0">
                  {initials}
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={plugin.enabled}
                    disabled={togglingId !== null}
                    onCheckedChange={() => handleToggle(plugin)}
                  />
                </div>
              </div>

              <h3 className="text-sm font-medium text-foreground truncate mb-1">{plugin.name}</h3>

              <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-8">
                {plugin.description || "No description"}
              </p>

              <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                <Badge variant="outline" size="sm">
                  {plugin.scope}
                </Badge>
                {plugin.version && (
                  <Badge variant="secondary" size="sm">
                    v{plugin.version}
                  </Badge>
                )}
                {update && (
                  <Badge variant="default" size="sm" className="gap-1">
                    <ArrowUpCircle className="size-3" />
                    Update
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedPlugin && (
        <PluginDetailModal
          installedPlugin={
            plugins.find(
              (p) => p.pluginId === selectedPlugin.pluginId && p.scope === selectedPlugin.scope,
            ) ?? selectedPlugin
          }
          update={getUpdate(selectedPlugin)}
          onClose={() => setSelectedPlugin(null)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
};
