import { invoke } from "@tauri-apps/api/core";

import type {
  ResolveSettingsCloseParams,
  SetWindowBackgroundParams,
} from "@/types/ipc";

/** Resolves the settings draft guard; cancellation clears any app-exit intent. Rejects with AppError if native close fails. */
export function resolveSettingsClose(accepted: boolean): Promise<void> {
  const params: ResolveSettingsCloseParams = { accepted };
  return invoke("resolve_settings_close", { params });
}

/** Sets both background layers of the calling window using #RRGGBB, e.g. "#22272e". Rejects invalid colors or native failures with AppError. */
export function setWindowBackground(color: string): Promise<void> {
  const params: SetWindowBackgroundParams = { color };
  return invoke("set_window_background", { params });
}
