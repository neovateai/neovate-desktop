import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Spinner } from "../../../components/ui/spinner";
import { client } from "../../../orpc";

type TFn = (key: string) => string;

const INVALID_REF_RULES: [RegExp, string][] = [
  [/\s/, "branch.create.noSpaces"],
  [/\.\./, "branch.create.noDoubleDot"],
  [/[\x00-\x1f\x7f~^:?*[\\]/, "branch.create.invalidChars"],
  [/\/$/, "branch.create.noTrailingSlash"],
  [/\.lock$/, "branch.create.noLockSuffix"],
  [/\.$/, "branch.create.noTrailingDot"],
  [/^[-.]/, "branch.create.noLeadingDashDot"],
  [/\/\//, "branch.create.invalidChars"],
  [/@\{/, "branch.create.invalidChars"],
];

function validateBranchName(name: string, t: TFn): string | null {
  if (!name || name.trim() === "") return t("branch.create.nameRequired");
  for (const [pattern, key] of INVALID_REF_RULES) {
    if (pattern.test(name)) return t(key);
  }
  return null;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cwd: string;
  currentBranch: string | null;
  onCreated: (name: string) => void;
};

export function CreateBranchDialog({ open, onOpenChange, cwd, currentBranch, onCreated }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState("neovate/");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validationError = validateBranchName(name, t as TFn);

  const handleCreate = useCallback(async () => {
    if (validationError) return;
    setLoading(true);
    setError(null);
    try {
      const result = await client.git.createBranch({ cwd, name });
      if (result.success) {
        window.dispatchEvent(new CustomEvent("neovate:branch-changed"));
        onCreated(name);
        onOpenChange(false);
        setName("neovate/");
        setError(null);
      } else {
        setError(result.error ?? t("branch.create.failed"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("branch.create.failed"));
    } finally {
      setLoading(false);
    }
  }, [cwd, name, validationError, onCreated, onOpenChange]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        setName("neovate/");
        setError(null);
      }
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("branch.create.title")}</DialogTitle>
          <DialogDescription>
            {currentBranch
              ? t("branch.create.fromBranch", {
                  branch: currentBranch,
                })
              : t("branch.create.fromHead")}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-4">
          <label className="mb-1.5 block text-sm font-medium">{t("branch.create.nameLabel")}</label>
          <Input
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter" && !validationError && !loading) {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="neovate/my-feature"
            autoFocus
          />
          {(validationError && name !== "neovate/") || error ? (
            <p className="mt-1.5 text-xs text-destructive">{error ?? validationError}</p>
          ) : null}
        </div>
        <DialogFooter variant="bare">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={!!validationError || loading}>
            {loading ? <Spinner className="h-4 w-4" /> : null}
            {t("branch.create.submit")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
