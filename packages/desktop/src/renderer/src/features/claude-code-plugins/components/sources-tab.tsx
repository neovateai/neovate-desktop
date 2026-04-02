import debug from "debug";
import { ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Marketplace } from "../../../../../shared/features/claude-code-plugins/types";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Spinner } from "../../../components/ui/spinner";
import { client } from "../../../orpc";
import { AddMarketplaceModal } from "./add-marketplace-modal";

const log = debug("neovate:plugins");

interface SourcesTabProps {
  marketplaces: Marketplace[];
  onBrowse: (name: string) => void;
  onRefresh: () => Promise<void>;
}

export const SourcesTab = ({ marketplaces, onBrowse, onRefresh }: SourcesTabProps) => {
  const { t } = useTranslation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRefresh = async (name: string) => {
    setRefreshingId(name);
    log("refreshing marketplace %s", name);
    try {
      await client.plugins.updateMarketplace({ name });
      await onRefresh();
    } finally {
      setRefreshingId(null);
    }
  };

  const handleRemove = async (name: string) => {
    setRemovingId(name);
    log("removing marketplace %s", name);
    try {
      await client.plugins.removeMarketplace({ name });
      await onRefresh();
    } finally {
      setRemovingId(null);
      setConfirmRemove(null);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return t("settings.plugins.updatedNever");
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return t("settings.plugins.updatedToday");
    if (diffDays === 1) return t("settings.plugins.updatedYesterday");
    if (diffDays < 30) return t("settings.plugins.updatedDaysAgo", { count: diffDays });
    return date.toLocaleDateString();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">
          {t("settings.plugins.sourcesCount", { count: marketplaces.length })}
        </span>
        <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)}>
          <Plus className="size-3.5" />
          {t("settings.plugins.addSource")}
        </Button>
      </div>

      {marketplaces.length === 0 ? (
        <div className="rounded-xl bg-muted/30 border border-border/50 py-8">
          <p className="text-sm text-muted-foreground text-center">
            {t("settings.plugins.noSourcesConfigured")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {marketplaces.map((mp) => (
            <div
              key={mp.name}
              className="flex items-center justify-between p-4 rounded-xl bg-background border border-border/50"
            >
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-foreground truncate">{mp.name}</h3>
                {mp.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{mp.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="outline" size="sm">
                    {mp.source.source}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {t("settings.plugins.pluginsCount", { count: mp.pluginCount })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("settings.plugins.updated", { time: formatDate(mp.lastUpdated) })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 ml-3 shrink-0">
                <Button variant="outline" size="sm" onClick={() => onBrowse(mp.name)}>
                  <ExternalLink className="size-3.5" />
                  {t("settings.plugins.browse")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRefresh(mp.name)}
                  disabled={refreshingId !== null}
                >
                  {refreshingId === mp.name ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                </Button>
                {confirmRemove === mp.name ? (
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setConfirmRemove(null)}>
                      {t("common.cancel")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemove(mp.name)}
                      disabled={removingId !== null}
                    >
                      {removingId === mp.name ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      {t("settings.plugins.remove")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setConfirmRemove(mp.name)}
                    className="text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddMarketplaceModal onClose={() => setShowAddModal(false)} onRefresh={onRefresh} />
      )}
    </>
  );
};
