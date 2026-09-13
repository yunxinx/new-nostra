import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDeleteProvider } from "@/hooks/use-providers";

interface DeleteProviderButtonProps {
  onDeleted: () => void;
  providerId: string;
}

// Confirmed delete, asked beside the button that starts it rather than in a
// window of its own: the confirmation belongs to this surface, and the pending
// state and the failure stay on it too. The caller only learns that the row is
// gone.
export function DeleteProviderButton({
  onDeleted,
  providerId,
}: DeleteProviderButtonProps) {
  const { t } = useTranslation();
  const remove = useDeleteProvider();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  function handleConfirm(): void {
    setIsConfirmOpen(false);
    remove.mutate({ id: providerId }, { onSuccess: onDeleted });
  }

  return (
    <div className="flex items-center gap-2">
      {remove.error !== null && (
        <p className="text-destructive text-xs" role="alert">
          {t(`errors.${remove.error.code}`)}
        </p>
      )}
      <Popover onOpenChange={setIsConfirmOpen} open={isConfirmOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" type="button" variant="destructive">
            <Trash2 className="size-3.5" />
            {t("settings.providers.delete")}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start">
          <PopoverHeader>
            <PopoverTitle>{t("settings.providers.deleteConfirm")}</PopoverTitle>
            <PopoverDescription>
              {t("settings.providers.deleteDescription")}
            </PopoverDescription>
          </PopoverHeader>
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setIsConfirmOpen(false)}
              size="xs"
              type="button"
              variant="ghost"
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={remove.isPending}
              onClick={handleConfirm}
              size="xs"
              type="button"
              variant="destructive"
            >
              {t("common.delete")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
