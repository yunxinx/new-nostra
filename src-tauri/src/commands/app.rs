use serde::Serialize;
use tauri::AppHandle;

use crate::error::AppError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub os: String,
}

// Reason: Tauri injects framework types by value (no reference CommandArg impl),
// so clippy's pass-by-reference suggestion cannot apply. Revoke if Tauri adds
// reference injection for AppHandle.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
pub fn app_info(app: AppHandle) -> Result<AppInfo, AppError> {
    let package = app.package_info();
    Ok(AppInfo {
        name: package.name.clone(),
        version: package.version.to_string(),
        os: std::env::consts::OS.to_string(),
    })
}
