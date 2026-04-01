import { Download, Plus } from "lucide-react";
import { useState } from "react";

import type { Marketplace, MarketplacePlugin } from "../../../../../shared/features/plugins/types";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Spinner } from "../../../components/ui/spinner";
import { client } from "../../../orpc";
import { PluginDetailModal } from "./plugin-detail-modal";

const getInitials = (name: string): string => {
  const words = name.split(/[\s-_]+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

interface DiscoverTabProps {
  plugins: MarketplacePlugin[];
  marketplaces: Marketplace[];
  onRefresh: () => Promise<void>;
}

export const DiscoverTab = ({ plugins, marketplaces, onRefresh }: DiscoverTabProps) => {
  const [selectedPlugin, setSelectedPlugin] = useState<MarketplacePlugin | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [addingOfficial, setAddingOfficial] = useState(false);

  const handleQuickInstall = async (plugin: MarketplacePlugin) => {
    const key = `${plugin.name}@${plugin.marketplace}`;
    if (installingId) return;
    setInstallingId(key);
    try {
      await client.plugins.install({
        pluginName: plugin.name,
        marketplace: plugin.marketplace,
        scope: "user",
      });
      await onRefresh();
    } catch {
      // Error handled by onRefresh
    } finally {
      setInstallingId(null);
    }
  };

  const handleAddOfficial = async () => {
    setAddingOfficial(true);
    try {
      await client.plugins.addMarketplace({ source: "anthropics/claude-plugins-official" });
      await onRefresh();
    } finally {
      setAddingOfficial(false);
    }
  };

  if (marketplaces.length === 0) {
    return (
      <div className="rounded-xl bg-muted/30 border border-border/50 py-12 px-6 text-center">
        <div className="flex items-center justify-center size-12 rounded-xl bg-primary/10 mx-auto mb-4">
          <Download className="size-6 text-primary" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-2">No plugin sources configured</h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
          Add the official Claude Code marketplace to discover and install plugins.
        </p>
        <Button variant="default" size="sm" onClick={handleAddOfficial} disabled={addingOfficial}>
          {addingOfficial ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />}
          Add Official Marketplace
        </Button>
      </div>
    );
  }

  if (plugins.length === 0) {
    return (
      <div className="rounded-xl bg-muted/30 border border-border/50 py-8">
        <p className="text-sm text-muted-foreground text-center">
          No plugins found matching your search.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {plugins.map((plugin) => {
          const key = `${plugin.name}@${plugin.marketplace}`;
          const initials = getInitials(plugin.name);
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
                {plugin.installed ? (
                  <Badge variant="secondary" size="sm">
                    Installed
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5"
                    disabled={installingId !== null}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickInstall(plugin);
                    }}
                  >
                    {installingId === key ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                  </Button>
                )}
              </div>

              <h3 className="text-sm font-medium text-foreground truncate mb-1">{plugin.name}</h3>

              <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-8">
                {plugin.description || "No description"}
              </p>

              <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                <Badge variant="outline" size="sm">
                  {plugin.marketplace}
                </Badge>
                {plugin.category && (
                  <Badge variant="secondary" size="sm">
                    {plugin.category}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedPlugin && (
        <PluginDetailModal
          marketplacePlugin={selectedPlugin}
          onClose={() => setSelectedPlugin(null)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
};
