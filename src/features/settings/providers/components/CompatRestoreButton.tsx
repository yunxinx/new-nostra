import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import type { CompatRestoreAction } from "./ModelDetail";

/**
 * The one control that takes a model's compat draft back to what the provider
 * gives it. It rewrites the draft the host's own reset and save buttons act on,
 * so the host places it among them and the action's owner publishes it.
 */
export function CompatRestoreButton({
  action,
  isSaving,
}: {
  action: CompatRestoreAction;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Button
      disabled={isSaving || action.isDisabled}
      onClick={action.restore}
      size="sm"
      type="button"
      variant="outline"
    >
      {t("settings.providers.restoreInheritedCompat")}
    </Button>
  );
}
