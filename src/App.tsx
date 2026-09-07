import { getCurrentWindow } from "@tauri-apps/api/window";
import { PanelLeft } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { AppInfo } from "@/types/ipc";

import { Button } from "@/components/ui/button";
import { useAppInfo } from "@/features/app/hooks/use-app-info";
import { useUiStore } from "@/stores/ui-store";
import { isAppError } from "@/types/ipc";

export function App() {
  const { t } = useTranslation();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const { data: appInfo, error } = useAppInfo();

  // The window is created hidden (geometry restores offscreen of view); this
  // mount effect runs after React's first commit, so show() reveals painted
  // content. Idempotent under StrictMode double-mount.
  useEffect(() => {
    void getCurrentWindow().show();
  }, []);

  return (
    <div className="bg-background text-foreground flex h-screen">
      {sidebarOpen && (
        <aside className="border-sidebar-border bg-sidebar w-64 shrink-0 border-r">
          <h2 className="text-sidebar-foreground px-4 py-3 text-sm font-semibold">
            {t("app.sidebarTitle")}
          </h2>
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <Button
            aria-label={t("app.toggleSidebar")}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            size="icon"
            variant="ghost"
          >
            <PanelLeft />
          </Button>
          <span className="text-sm font-semibold">
            {appInfo?.name ?? t("app.name")}
          </span>
        </header>

        <section className="flex-1 overflow-y-auto p-4">
          {error ? (
            <InfoError error={error} />
          ) : appInfo ? (
            <InfoCard appInfo={appInfo} />
          ) : null}
        </section>
      </main>
    </div>
  );
}

function InfoCard({ appInfo }: { appInfo: AppInfo }) {
  const { t } = useTranslation();

  return (
    <div className="bg-card text-card-foreground rounded-xl border p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("app.infoTitle")}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("app.version")}</dt>
        <dd>{appInfo.version}</dd>
        <dt className="text-muted-foreground">{t("app.os")}</dt>
        <dd>{appInfo.os}</dd>
      </dl>
    </div>
  );
}

function InfoError({ error }: { error: unknown }) {
  const { t } = useTranslation();

  // Rust rejections carry the AppError shape; anything else is unexpected.
  const copy = isAppError(error)
    ? t(`errors.${error.code}`)
    : t("app.infoUnavailable");
  return <p className="text-destructive text-sm">{copy}</p>;
}
