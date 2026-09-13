import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/icon-button";

export function RevertButton({ onRevert }: { onRevert: () => void }) {
  const { t } = useTranslation();
  return (
    <IconButton
      aria-label={t("common.revertField")}
      onClick={onRevert}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <RotateCcw className="size-3" />
    </IconButton>
  );
}
