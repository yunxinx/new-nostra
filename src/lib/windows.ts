import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { error as logError } from "@tauri-apps/plugin-log";

const SETTINGS_WINDOW_LABEL = "settings";

// "settings.html" is a bare path, which the WebviewUrl deserializer maps to
// the app origin (dev server URL in dev mode, bundled assets in release), so
// the same string loads the Vite settings entry in both modes.
export async function openSettings(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL);
  if (existing) {
    await existing.setFocus();
    return;
  }
  const settingsWindow = new WebviewWindow(SETTINGS_WINDOW_LABEL, {
    height: 680,
    minHeight: 420,
    minWidth: 640,
    title: "Nostra Settings",
    titleBarStyle: "overlay",
    url: "settings.html",
    visible: false,
    width: 1040,
  });
  // The constructor reports create failures on this event instead of
  // rejecting a promise; registration is synchronous, so it is in place
  // before the async failure can be emitted.
  void settingsWindow.once("tauri://error", (event) => {
    void logError(
      `settings window creation failed: ${JSON.stringify(event.payload)}`,
    );
  });
}
