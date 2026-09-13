import type { UnlistenFn } from "@tauri-apps/api/event";

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";

import { resolveWindowBackground } from "@/lib/window-background";
import { useUiStore } from "@/stores/ui-store";

const SETTINGS_WINDOW_LABEL = "settings";
const SETTINGS_WINDOW_WIDTH = 1040;
const SETTINGS_WINDOW_HEIGHT = 680;

let openingSettings: null | Promise<void> = null;

// "settings.html" is a bare path, which the WebviewUrl deserializer maps to
// the app origin (dev server URL in dev mode, bundled assets in release), so
// the same string loads the Vite settings entry in both modes.
export function openSettings(): Promise<void> {
  openingSettings ??= openSettingsWindow().finally(() => {
    openingSettings = null;
  });
  return openingSettings;
}

// Centers the settings window on the main window's chat column (the main
// window minus the sidebar) and clamps it into the current monitor. All
// window geometry APIs below return physical pixels, which are converted to
// logical so they can feed WindowOptions' logical x/y.
async function computeSettingsPosition(): Promise<{ x: number; y: number }> {
  const { sidebarCollapsed, sidebarWidth } = useUiStore.getState();
  const sidebar = sidebarCollapsed ? 0 : sidebarWidth;

  const mainWindow = getCurrentWindow();
  const [scaleFactor, position, size, monitor] = await Promise.all([
    mainWindow.scaleFactor(),
    mainWindow.innerPosition(),
    mainWindow.innerSize(),
    currentMonitor(),
  ]);

  const windowX = position.x / scaleFactor;
  const windowY = position.y / scaleFactor;
  const windowWidth = size.width / scaleFactor;
  const windowHeight = size.height / scaleFactor;

  const columnX = windowX + sidebar;
  const columnWidth = windowWidth - sidebar;
  let x = columnX + (columnWidth - SETTINGS_WINDOW_WIDTH) / 2;
  let y = windowY + (windowHeight - SETTINGS_WINDOW_HEIGHT) / 2;

  if (monitor) {
    const monitorX = monitor.workArea.position.x / monitor.scaleFactor;
    const monitorY = monitor.workArea.position.y / monitor.scaleFactor;
    const monitorWidth = monitor.workArea.size.width / monitor.scaleFactor;
    const monitorHeight = monitor.workArea.size.height / monitor.scaleFactor;
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

async function openSettingsWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(SETTINGS_WINDOW_LABEL);
  if (existing) {
    if (await existing.isMinimized()) {
      await existing.unminimize();
    }
    await existing.setFocus();
    return;
  }
  const { x, y } = await computeSettingsPosition();
  const settingsWindow = new WebviewWindow(SETTINGS_WINDOW_LABEL, {
    // Native and webview backgrounds cover the interval before CSS loads.
    backgroundColor: resolveWindowBackground(),
    height: SETTINGS_WINDOW_HEIGHT,
    // WindowOptions x/y are logical pixels; hiddenTitle maps to macOS
    // NSWindow.titleVisibility = hidden so the overlay title bar draws no text.
    hiddenTitle: true,
    // The three columns (200px nav + 200px provider list + the detail pane)
    // plus the detail's own six-column model table set the floor: below this
    // the pane cannot show a row's label and its control on one line.
    minHeight: 480,
    minWidth: 860,
    title: "Nostra Settings",
    titleBarStyle: "overlay",
    url: "settings.html",
    visible: false,
    width: SETTINGS_WINDOW_WIDTH,
    x,
    y,
  });
  // Tauri registers these constructor-local handlers synchronously, before
  // its creation promise can settle. Dispose both outcomes after either one.
  const listeners: Promise<UnlistenFn>[] = [];
  const created = new Promise<void>((resolve, reject) => {
    listeners.push(
      settingsWindow.once("tauri://created", () => resolve()),
      settingsWindow.once("tauri://error", (event) =>
        reject(new Error(String(event.payload))),
      ),
    );
  });
  try {
    await Promise.all([created, ...listeners]);
  } finally {
    for (const listener of await Promise.allSettled(listeners)) {
      if (listener.status === "fulfilled") listener.value();
    }
  }
}
