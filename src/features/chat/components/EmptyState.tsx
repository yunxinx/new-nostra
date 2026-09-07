import { useTranslation } from "react-i18next";

interface EmptyStateProps {
  variant: "newChat" | "noSessions";
}

export function EmptyState({ variant }: EmptyStateProps) {
  const { t } = useTranslation();

  const copy =
    variant === "noSessions"
      ? {
          hint: t("chat.empty.noSessionsHint"),
          title: t("chat.empty.noSessionsTitle"),
        }
      : {
          hint: t("chat.empty.newChatHint"),
          title: t("chat.empty.newChatTitle"),
        };

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="px-6 py-10 text-center select-none">
        <h2 className="text-foreground text-2xl font-semibold">{copy.title}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{copy.hint}</p>
      </div>
    </div>
  );
}
