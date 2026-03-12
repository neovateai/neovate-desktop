import { useCallback, useState } from "react";

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

const INVALID_REF_PATTERNS = [
  /\s/, // no whitespace
  /\.\./, // no ..
  /[\x00-\x1f\x7f~^:?*[\\]/, // no control chars or special chars
  /\/$/, // cannot end with /
  /\.lock$/, // cannot end with .lock
  /\.$/, // cannot end with .
  /^[-.]/, // cannot start with - or .
  /\/\//, // no consecutive slashes
  /@\{/, // no @{
];

function validateBranchName(name: string): string | null {
  if (!name || name.trim() === "") return "Branch name is required";
  for (const pattern of INVALID_REF_PATTERNS) {
    if (pattern.test(name)) {
      if (pattern === INVALID_REF_PATTERNS[0]) return "Branch name cannot contain spaces";
      if (pattern === INVALID_REF_PATTERNS[1]) return 'Branch name cannot contain ".."';
      if (pattern === INVALID_REF_PATTERNS[4]) return "Branch name cannot end with /";
      if (pattern === INVALID_REF_PATTERNS[5]) return 'Branch name cannot end with ".lock"';
      if (pattern === INVALID_REF_PATTERNS[6]) return "Branch name cannot end with .";
      if (pattern === INVALID_REF_PATTERNS[7]) return 'Branch name cannot start with "-" or "."';
      return "Branch name contains invalid characters";
    }
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
  const [name, setName] = useState("neovate/");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validationError = validateBranchName(name);

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
        setError(result.error ?? "Failed to create branch");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create branch");
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
          <DialogTitle>Create New Branch</DialogTitle>
          <DialogDescription>
            {currentBranch ? `From current branch (${currentBranch})` : "From current HEAD"}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-4">
          <label className="mb-1.5 block text-sm font-medium">Branch name</label>
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
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!!validationError || loading}>
            {loading ? <Spinner className="h-4 w-4" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
