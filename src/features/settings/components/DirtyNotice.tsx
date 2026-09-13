import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DirtyNoticeProps {
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
}

// Modal guard over the blocked action: the page's own confirm never runs
// before the user answers, and every dismissal — Escape, the overlay, the
// cancel button — takes the cancel path, so a parked navigation is never
// answered twice.
//
// The confirm is a plain button rather than the dialog's action: the action
// closes the dialog on its way out, which would fire the cancel path a second
// time and undo the answer the confirm just gave. Its exit comes from the
// parent dropping `open` once the discard lands.
export function DirtyNotice({ onCancel, onConfirm, open }: DirtyNoticeProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
      open={open}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.unsavedTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("common.unsavedDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <Button onClick={onConfirm} size="default" variant="destructive">
            {t("common.discard")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
