import { invoke } from "@tauri-apps/api/core";

import type { AppInfo } from "@/types/ipc";

/**
 * Reads immutable app identity (name, version, os) from the `app_info` command.
 * Constraint: shape guaranteed by serde camelCase on commands/app.rs AppInfo.
 * Failure: rejects with AppError (mirrored in types/ipc.ts).
 */
export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}
