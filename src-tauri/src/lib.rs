// Tests may use unwrap/expect on fixtures; production paths must propagate errors.
#![cfg_attr(test, allow(clippy::unwrap_used, clippy::expect_used))]

mod db;
mod error;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
// Reason: startup assembly failure has no recovery path before the event loop
// exists (Tauri-sanctioned panic semantics). Revoke if run() gains graceful startup error handling.
#[allow(clippy::expect_used)]
pub fn run() {
    tauri::Builder::default()
        // single-instance must stay the first registered plugin; its setup acquires
        // the instance lock before any other plugin can spawn side effects.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        // Restores saved geometry while the window is still hidden. VISIBLE is
        // excluded on purpose: with it, the plugin shows the window pre-paint
        // at the pre-restore frame, which macOS renders before applying the
        // restored position — a visible flash. The frontend reveals the window
        // after its first paint (App.tsx).
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // The settings window's placement is recomputed on every open
                // (centered on the chat column by the frontend); the plugin's
                // restore would override it with the last-closed position.
                .with_denylist(&["settings"])
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED
                        | tauri_plugin_window_state::StateFlags::DECORATIONS
                        | tauri_plugin_window_state::StateFlags::FULLSCREEN,
                )
                .build(),
        )
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Trace
                } else {
                    log::LevelFilter::Info
                })
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: None,
                    }),
                ])
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let connection = db::init(app.handle())?;
            app.manage(state::AppState { db: tokio::sync::Mutex::new(connection) });

            // macOS requires an application menu for standard accelerators to work.
            #[cfg(target_os = "macos")]
            {
                let menu = tauri::menu::Menu::default(app.handle())?;
                app.set_menu(menu)?;
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Nostra")
        .run(|_app, event| match event {
            // Dock-click fallback: the frontend shows the window on mount, but
            // if that path ever fails the user must not be left with a hidden
            // window and a dead dock icon. Non-macOS builds compile this arm
            // out, leaving _app unused there (underscore prefix covers both).
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                if let Some(window) = _app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        });
}
