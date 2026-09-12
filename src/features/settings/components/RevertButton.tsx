import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function RevertButton({ onRevert }: { onRevert: () => void }) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={t("common.revertField")}
          onClick={onRevert}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <RotateCcw className="size-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("common.revertField")}</TooltipContent>
    </Tooltip>
  );
}
