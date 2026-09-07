// @tauri-apps/api 2.x ships no platform() helper (it lives in the
// tauri-plugin-os crate, which this app does not register), so macOS-only
// affordances are derived from the webview user agent instead. The agent
// string is fixed for the process lifetime, so the check runs once here.
const IS_MAC_OS = navigator.userAgent.includes("Macintosh");

export function isMacOs(): boolean {
  return IS_MAC_OS;
}
