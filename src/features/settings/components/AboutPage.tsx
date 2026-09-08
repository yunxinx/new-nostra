import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const APP_NAME = "Nostra";

export function AboutPage() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<null | string>(null);

  useEffect(() => {
    let isUnmounted = false;
    void getVersion().then((appVersion) => {
      if (!isUnmounted) {
        setVersion(appVersion);
      }
    });
    return () => {
      isUnmounted = true;
    };
  }, []);

  return (
    <div className="text-foreground flex h-full flex-col items-center justify-center gap-2 px-10 py-12">
      <h2 className="text-lg font-semibold">{APP_NAME}</h2>
      {version !== null && (
        <p className="text-muted-foreground text-sm">
          {t("settings.about.version", { version })}
        </p>
      )}
      <p className="text-muted-foreground text-sm">
        {t("settings.about.description")}
      </p>
      <p className="text-muted-foreground text-sm">
        {t("settings.about.license")}
      </p>
    </div>
  );
}
