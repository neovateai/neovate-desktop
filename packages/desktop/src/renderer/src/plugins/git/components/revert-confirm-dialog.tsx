import { memo } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { Button } from "../../../components/ui/button";
import { useGitTranslation } from "../i18n";

interface RevertConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: "all" | "single" | null;
  fileName?: string;
  onConfirm: () => void;
}

export const RevertConfirmDialog = memo(function RevertConfirmDialog({
  open,
  onOpenChange,
  target,
  fileName,
  onConfirm,
}: RevertConfirmDialogProps) {
  const { t } = useGitTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target === "all" ? t("git.revertAll.title") : t("git.revert.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target === "all"
              ? t("git.revertAll.description")
              : t("git.revert.description", { name: fileName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            {t("common.cancel", { ns: "translation" })}
          </AlertDialogClose>
          <Button variant="destructive" onClick={onConfirm}>
            {t("git.revert.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
});
