import { useTranslation } from "react-i18next";

export function EmptyState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="px-6 py-10 text-center select-none">
        <h2 className="text-foreground text-2xl font-semibold">
          {t("chat.empty.newChatTitle")}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {t("chat.empty.newChatHint")}
        </p>
      </div>
    </div>
  );
}
