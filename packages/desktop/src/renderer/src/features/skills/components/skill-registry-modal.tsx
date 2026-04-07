import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { SkillsRegistry } from "../../../../../shared/features/config/types";

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
import { cn } from "../../../lib/utils";

interface SkillRegistryModalProps {
  registries: SkillsRegistry[];
  onAdd: (registry: SkillsRegistry) => void;
  onRemove: (index: number) => void;
  onClose: () => void;
}

export const SkillRegistryModal = ({
  registries,
  onAdd,
  onRemove,
  onClose,
}: SkillRegistryModalProps) => {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(registries.length === 0);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState(false);
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState<number | null>(null);

  const handleAdd = () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      setUrlError(true);
      return;
    }

    onAdd({ url: trimmed });
    setUrl("");
    setUrlError(false);
    setShowAddForm(false);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.skills.manageRegistries")}</DialogTitle>
          <DialogDescription>{t("settings.skills.addRegistryDescription")}</DialogDescription>
        </DialogHeader>

        <DialogPanel>
          {/* Existing registries */}
          {registries.length > 0 && (
            <div className="space-y-2 mb-4">
              {registries.map((reg, i) => (
                <div
                  key={`${reg.url}-${i}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/50"
                >
                  <p className="text-sm text-foreground truncate min-w-0 flex-1">{reg.url}</p>
                  {confirmRemoveIndex === i ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setConfirmRemoveIndex(null)}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          onRemove(i);
                          setConfirmRemoveIndex(null);
                        }}
                      >
                        {t("settings.skills.removeRegistry")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => setConfirmRemoveIndex(i)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add form */}
          {showAddForm ? (
            <div className="space-y-3 rounded-lg border border-border/50 p-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {t("settings.skills.registryUrl")}
                </label>
                <Input
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setUrlError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && url.trim()) handleAdd();
                  }}
                  placeholder={t("settings.skills.registryUrlPlaceholder")}
                  className={cn(urlError && "border-destructive")}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false);
                    setUrl("");
                    setUrlError(false);
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button variant="default" size="sm" onClick={handleAdd} disabled={!url.trim()}>
                  {t("settings.skills.addRegistry")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="size-3.5" />
              {t("settings.skills.addRegistry")}
            </Button>
          )}
        </DialogPanel>

        <DialogFooter variant="bare">
          <div className="flex justify-end w-full">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common.done")}
            </Button>
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
};
