import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { error as logError } from "@tauri-apps/plugin-log";

import { resolveWindowBackground } from "@/lib/window-background";
import { useUiStore } from "@/stores/ui-store";

const SETTINGS_WINDOW_LABEL = "settings";
const SETTINGS_WINDOW_WIDTH = 1040;
const SETTINGS_WINDOW_HEIGHT = 680;

// "settings.html" is a bare path, which the WebviewUrl deserializer maps to
// the app origin (dev server URL in dev mode, bundled assets in release), so
// the same string loads the Vite settings entry in both modes.
export async function openSettings(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL);
  if (existing) {
    await existing.setFocus();
    return;
  }
  const { x, y } = await computeSettingsPosition();
  const settingsWindow = new WebviewWindow(SETTINGS_WINDOW_LABEL, {
    // Pre-paints the NSWindow and WKWebView background so the
    // hidden-then-shown window never flashes white before CSS paints.
    backgroundColor: resolveWindowBackground(),
    height: SETTINGS_WINDOW_HEIGHT,
    // WindowOptions x/y are logical pixels; hiddenTitle maps to macOS
    // NSWindow.titleVisibility = hidden so the overlay title bar draws no text.
    hiddenTitle: true,
    minHeight: 420,
    minWidth: 640,
    title: "Nostra Settings",
    titleBarStyle: "overlay",
    url: "settings.html",
    visible: false,
    width: SETTINGS_WINDOW_WIDTH,
    x,
    y,
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

// Centers the settings window on the main window's chat column (the main
// window minus the sidebar) and clamps it into the current monitor. All
// window geometry APIs below return physical pixels, which are converted to
// logical so they can feed WindowOptions' logical x/y.
async function computeSettingsPosition(): Promise<{ x: number; y: number }> {
  const { sidebarCollapsed, sidebarWidth } = useUiStore.getState();
  const sidebar = sidebarCollapsed ? 0 : sidebarWidth;

  const mainWindow = getCurrentWindow();
  const scaleFactor = await mainWindow.scaleFactor();
  const position = await mainWindow.innerPosition();
  const size = await mainWindow.innerSize();

  const windowX = position.x / scaleFactor;
  const windowY = position.y / scaleFactor;
  const windowWidth = size.width / scaleFactor;
  const windowHeight = size.height / scaleFactor;

  const columnX = windowX + sidebar;
  const columnWidth = windowWidth - sidebar;
  let x = columnX + (columnWidth - SETTINGS_WINDOW_WIDTH) / 2;
  let y = windowY + (windowHeight - SETTINGS_WINDOW_HEIGHT) / 2;

  const monitor = await currentMonitor();
  if (monitor) {
    const monitorX = monitor.position.x / monitor.scaleFactor;
    const monitorY = monitor.position.y / monitor.scaleFactor;
    const monitorWidth = monitor.size.width / monitor.scaleFactor;
    const monitorHeight = monitor.size.height / monitor.scaleFactor;
    x = Math.max(
      monitorX,
      Math.min(x, monitorX + monitorWidth - SETTINGS_WINDOW_WIDTH),
    );
    y = Math.max(
      monitorY,
      Math.min(y, monitorY + monitorHeight - SETTINGS_WINDOW_HEIGHT),
    );
  }

  return { x, y };
}
