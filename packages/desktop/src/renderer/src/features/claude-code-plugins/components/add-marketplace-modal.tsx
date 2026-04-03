import debug from "debug";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Spinner } from "../../../components/ui/spinner";
import { client } from "../../../orpc";

const log = debug("neovate:plugins");

interface AddMarketplaceModalProps {
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export const AddMarketplaceModal = ({ onClose, onRefresh }: AddMarketplaceModalProps) => {
  const { t } = useTranslation();
  const [source, setSource] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    const trimmed = source.trim();
    if (!trimmed) return;
    log("adding marketplace: %s", trimmed);
    setAdding(true);
    setError(null);
    try {
      await client.plugins.addMarketplace({ source: trimmed });
      await onRefresh();
      onClose();
    } catch (e: any) {
      setError(e.message || t("settings.plugins.addMarketplaceFailed"));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.plugins.addMarketplaceTitle")}</DialogTitle>
          <DialogDescription>{t("settings.plugins.addMarketplaceDescription")}</DialogDescription>
        </DialogHeader>

        <DialogPanel>
          <div className="space-y-3">
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="owner/repo or https://..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && source.trim()) handleAdd();
              }}
              autoFocus
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <div>{t("settings.plugins.examples")}</div>
              <div className="pl-2">
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
                  anthropics/claude-plugins-official
                </code>
              </div>
              <div className="pl-2">
                <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
                  https://github.com/owner/marketplace.git
                </code>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </DialogPanel>

        <DialogFooter variant="bare">
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleAdd}
              disabled={!source.trim() || adding}
            >
              {adding ? <Spinner className="size-3.5" /> : null}
              {adding ? t("settings.plugins.adding") : t("settings.plugins.add")}
            </Button>
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
};
