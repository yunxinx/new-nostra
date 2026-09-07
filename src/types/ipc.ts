/**
 * Mirrors src-tauri/src/error.rs `AppError` (serde camelCase struct,
 * snake_case ErrorCode). Delivered as the invoke() rejection value.
 * Example value: { code: "not_found", message: "session gone" }
 */
export interface AppError {
  code:
    | "config"
    | "db"
    | "internal"
    | "invalid_input"
    | "network"
    | "not_found"
    | "protocol";
  message: string;
}

/**
 * Mirrors src-tauri/src/commands/app.rs `AppInfo` (serde rename_all camelCase).
 * Example value: { name: "Nostra", version: "0.1.0", os: "macos" }
 */
export interface AppInfo {
  name: string;
  os: string;
  version: string;
}

/**
 * Narrows an invoke() rejection to AppError. Constraint: anything not matching
 * the seven contract codes fails the check and is treated as unexpected.
 */
export function isAppError(value: unknown): value is AppError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "code" in value &&
    "message" in value &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    appErrorCodes.has(value.code)
  );
}

const appErrorCodes: ReadonlySet<string> = new Set([
  "config",
  "db",
  "internal",
  "invalid_input",
  "network",
  "not_found",
  "protocol",
]);
