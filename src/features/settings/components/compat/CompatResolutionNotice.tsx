import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import type { CompatResolution } from "./use-compat-resolution";

export function CompatResolutionNotice({
  resolution,
}: {
  resolution: CompatResolution;
}) {
  const { t } = useTranslation();
  if (resolution.error === null) return null;
  return (
    <div
      className="text-destructive flex items-center gap-2 py-2 text-xs"
      role="alert"
    >
      <span>{t("settings.providers.compatResolutionFailed")}</span>
      <Button
        aria-disabled={resolution.isLoading}
        className="aria-disabled:opacity-50"
        onClick={() => {
          if (!resolution.isLoading) resolution.retry();
        }}
        size="xs"
        type="button"
        variant="outline"
      >
        {t("common.retry")}
      </Button>
    </div>
  );
}
