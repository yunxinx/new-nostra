import { useTranslation } from "react-i18next";

import type { CompatSource } from "@/types/ipc";

interface CompatSourceBadgeProps {
  source: CompatSource;
}

// Provenance tag of one effective value: the merge layer that supplied it.
export function CompatSourceBadge({ source }: CompatSourceBadgeProps) {
  const { t } = useTranslation();
  return (
    <span className="bg-foreground/5 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] leading-none select-none">
      {t(`settings.providers.compatSources.${source}`)}
    </span>
  );
}
