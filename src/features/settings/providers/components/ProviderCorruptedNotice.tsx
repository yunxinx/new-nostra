import { useTranslation } from "react-i18next";

import { DeleteProviderButton } from "./DeleteProviderButton";

interface ProviderCorruptedNoticeProps {
  onDeleted: () => void;
  providerId: string;
}

// A row whose stored columns no longer decode: no field of it is trustworthy,
// so the only sound operation is deletion, after which the provider can be
// recreated by hand.
export function ProviderCorruptedNotice({
  onDeleted,
  providerId,
}: ProviderCorruptedNoticeProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-3 py-3 text-sm">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">
          {t("settings.providers.corruptedNotice")}
        </h3>
        <p className="text-muted-foreground">
          {t("settings.providers.corruptedHint")}
        </p>
      </div>
      <DeleteProviderButton onDeleted={onDeleted} providerId={providerId} />
    </div>
  );
}
