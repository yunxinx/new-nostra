import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

interface DirtyNoticeProps {
  onCancel: () => void;
  onConfirm: () => void;
}

// Non-modal guard: the blocked action runs only after the user confirms that
// the unsaved draft may be discarded. It is a plain surface, not a dialog —
// the page stays operable while the notice is up.
export function DirtyNotice({ onCancel, onConfirm }: DirtyNoticeProps) {
  const { t } = useTranslation();
  return (
    <div
      className="bg-muted/60 flex shrink-0 items-center justify-between gap-3 px-10 py-2"
      role="status"
    >
      <p className="text-sm">{t("settings.providers.dirtyNotice")}</p>
      <div className="flex shrink-0 items-center gap-2">
        <Button onClick={onCancel} size="xs" type="button" variant="ghost">
          {t("common.cancel")}
        </Button>
        <Button
          onClick={onConfirm}
          size="xs"
          type="button"
          variant="destructive"
        >
          {t("settings.providers.discard")}
        </Button>
      </div>
    </div>
  );
}
