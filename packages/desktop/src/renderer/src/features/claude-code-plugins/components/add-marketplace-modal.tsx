import debug from "debug";
import { useState } from "react";

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
      setError(e.message || "Failed to add marketplace");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Marketplace Source</DialogTitle>
          <DialogDescription>
            Enter a GitHub repository or git URL to add as a plugin marketplace source.
          </DialogDescription>
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
              <div>Examples:</div>
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
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleAdd}
              disabled={!source.trim() || adding}
            >
              {adding ? <Spinner className="size-3.5" /> : null}
              {adding ? "Adding..." : "Add"}
            </Button>
          </div>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
};
