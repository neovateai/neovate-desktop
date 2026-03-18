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

interface CommitConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const CommitConfirmDialog = memo(function CommitConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: CommitConfirmDialogProps) {
  const { t } = useGitTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("git.commitNoStaged.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("git.commitNoStaged.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            {t("common.cancel", { ns: "translation" })}
          </AlertDialogClose>
          <Button variant="default" onClick={onConfirm}>
            {t("git.commit")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
});
