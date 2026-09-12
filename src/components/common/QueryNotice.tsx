import { useTranslation } from "react-i18next";

import type { AppError } from "@/types/ipc";

import { Button } from "@/components/ui/button";

interface QueryNoticeProps {
  error: AppError | null;
  isLoading: boolean;
  onRetry: () => void;
}

export function QueryNotice({ error, isLoading, onRetry }: QueryNoticeProps) {
  const { t } = useTranslation();
  if (error !== null)
    return (
      <div
        className="text-destructive flex items-center gap-2 py-2 text-xs"
        role="alert"
      >
        <span>{t(`errors.${error.code}`)}</span>
        <Button onClick={onRetry} size="xs" type="button" variant="outline">
          {t("common.retry")}
        </Button>
      </div>
    );
  return isLoading ? (
    <p className="text-muted-foreground py-2 text-xs" role="status">
      {t("common.loading")}
    </p>
  ) : null;
}
