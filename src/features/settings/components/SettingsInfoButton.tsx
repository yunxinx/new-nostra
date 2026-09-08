import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SettingsInfoButtonProps {
  description: string;
}

// 18px ghost icon button that opens a click Popover with the row's long-form
// explanation; the description text is translated by the caller.
export function SettingsInfoButton({ description }: SettingsInfoButtonProps) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={t("settings.moreInformation")}
          className="hover:bg-foreground/10 text-muted-foreground focus-visible:ring-ring/50 flex size-[18px] items-center justify-center rounded-[4px] outline-none focus-visible:ring-3"
          type="button"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-fit max-w-[300px]">
        {description}
      </PopoverContent>
    </Popover>
  );
}
