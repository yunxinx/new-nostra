import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { ProviderCatalogChanged } from "@/types/ipc";

/** Subscribes to committed catalog changes; the owner must dispose the listener. Rejects if registration fails. */
export function listenProviderCatalogChanges(
  onChange: () => void,
): Promise<UnlistenFn> {
  return listen<ProviderCatalogChanged>("providers://changed", onChange);
}
