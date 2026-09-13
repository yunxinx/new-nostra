use std::sync::Mutex;

use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

use crate::error::{AppError, ErrorCode};

const MAIN_WINDOW: &str = "main";
const SETTINGS_WINDOW: &str = "settings";

#[derive(Default)]
pub struct WindowLifecycle(Mutex<ClosePolicy>);

#[derive(Default)]
struct ClosePolicy {
    exit_code: Option<i32>,
    waiting_for_settings: bool,
    destroying_settings: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CloseAction {
    None,
    RequestSettingsClose,
    DestroySettings,
    Exit(i32),
}

impl ClosePolicy {
    fn request_exit(&mut self, code: i32, has_settings: bool) -> CloseAction {
        if !has_settings {
            *self = Self::default();
            return CloseAction::Exit(code);
        }
        self.exit_code = Some(code);
        if self.waiting_for_settings || self.destroying_settings {
            return CloseAction::None;
        }
        self.waiting_for_settings = true;
        CloseAction::RequestSettingsClose
    }

    fn settings_close_requested(&mut self) {
        self.waiting_for_settings = true;
    }

    fn resolve_settings_close(&mut self, accepted: bool, has_settings: bool) -> CloseAction {
        if !accepted {
            *self = Self::default();
            return CloseAction::None;
        }
        if !has_settings {
            return self.settings_destroyed();
        }
        if self.destroying_settings {
            return CloseAction::None;
        }
        self.destroying_settings = true;
        CloseAction::DestroySettings
    }

    fn settings_destroyed(&mut self) -> CloseAction {
        let exit_code = self.exit_code;
        *self = Self::default();
        exit_code.map_or(CloseAction::None, CloseAction::Exit)
    }
}

impl WindowLifecycle {
    fn transition(
        &self,
        change: impl FnOnce(&mut ClosePolicy) -> CloseAction,
    ) -> Result<CloseAction, AppError> {
        let mut policy = self.0.lock().map_err(|_| AppError {
            code: ErrorCode::Internal,
            message: "window lifecycle lock poisoned".into(),
        })?;
        Ok(change(&mut policy))
    }
}

pub fn on_event(app: &AppHandle, event: &RunEvent) {
    let result = match event {
        RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { api, .. }, .. }
            if label == MAIN_WINDOW =>
        {
            // Keep the parent alive until its settings draft has answered.
            api.prevent_close();
            request_exit(app, 0)
        }
        RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { .. }, .. }
            if label == SETTINGS_WINDOW =>
        {
            app.state::<WindowLifecycle>()
                .transition(|policy| {
                    policy.settings_close_requested();
                    CloseAction::None
                })
                .map(|_| ())
        }
        RunEvent::WindowEvent { label, event: WindowEvent::Destroyed, .. }
            if label == SETTINGS_WINDOW =>
        {
            app.state::<WindowLifecycle>()
                .transition(ClosePolicy::settings_destroyed)
                .and_then(|action| apply_action(app, action))
        }
        RunEvent::ExitRequested { api, code, .. }
            if app.get_webview_window(SETTINGS_WINDOW).is_some() =>
        {
            api.prevent_exit();
            request_exit(app, code.unwrap_or(0))
        }
        _ => Ok(()),
    };
    if let Err(error) = result {
        log::error!("window lifecycle failed: code={:?}: {error}", error.code);
    }
}

pub fn resolve_settings_close(app: &AppHandle, accepted: bool) -> Result<(), AppError> {
    let has_settings = app.get_webview_window(SETTINGS_WINDOW).is_some();
    let action = app
        .state::<WindowLifecycle>()
        .transition(|policy| policy.resolve_settings_close(accepted, has_settings))?;
    apply_action(app, action)
}

fn request_exit(app: &AppHandle, code: i32) -> Result<(), AppError> {
    let settings = app.get_webview_window(SETTINGS_WINDOW);
    let has_settings = settings.is_some();
    let action = app
        .state::<WindowLifecycle>()
        .transition(|policy| policy.request_exit(code, has_settings))?;
    if let Some(window) = settings {
        // A draft confirmation must remain reachable when the settings
        // window was minimized or sits behind the main window.
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        let _ = window.set_focus();
    }
    apply_action(app, action)
}

fn apply_action(app: &AppHandle, action: CloseAction) -> Result<(), AppError> {
    let result = match action {
        CloseAction::None => Ok(()),
        CloseAction::Exit(code) => {
            app.exit(code);
            Ok(())
        }
        CloseAction::RequestSettingsClose => match app.get_webview_window(SETTINGS_WINDOW) {
            Some(window) => window.close(),
            None => return complete_missing_settings(app),
        },
        CloseAction::DestroySettings => match app.get_webview_window(SETTINGS_WINDOW) {
            Some(window) => window.destroy(),
            None => return complete_missing_settings(app),
        },
    };
    result.map_err(|error| {
        // A failed native action cancels its exit intent so an independent
        // settings close cannot inherit it.
        let _ = app.state::<WindowLifecycle>().transition(|policy| {
            *policy = ClosePolicy::default();
            CloseAction::None
        });
        AppError {
            code: ErrorCode::Internal,
            message: format!("native window action failed: {error}"),
        }
    })
}

fn complete_missing_settings(app: &AppHandle) -> Result<(), AppError> {
    let action = app.state::<WindowLifecycle>().transition(ClosePolicy::settings_destroyed)?;
    apply_action(app, action)
}

#[cfg(target_os = "macos")]
pub fn install_menu(app: &AppHandle) -> Result<(), AppError> {
    use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem};

    let menu = Menu::default(app)?;
    let quit_text = PredefinedMenuItem::quit(app, None)?.text()?;
    let quit = MenuItem::with_id(app, "nostra-quit", &quit_text, true, Some("CmdOrCtrl+Q"))?;
    let mut replaced_quit = false;
    for item in menu.items()? {
        if let MenuItemKind::Submenu(submenu) = item {
            for (position, item) in submenu.items()?.into_iter().enumerate() {
                if let MenuItemKind::Predefined(predefined) = item {
                    if predefined.text()? == quit_text {
                        // The predefined macOS item calls NSApplication's
                        // terminate: directly, bypassing Tauri's exit guard.
                        submenu.remove(&predefined)?;
                        submenu.insert(&quit, position)?;
                        replaced_quit = true;
                    }
                }
            }
        }
    }
    if !replaced_quit {
        return Err(AppError {
            code: ErrorCode::Config,
            message: "default application menu has no quit item".into(),
        });
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id() == "nostra-quit" {
            app.exit(0);
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_close_without_settings_exits() {
        assert_eq!(ClosePolicy::default().request_exit(0, false), CloseAction::Exit(0));
    }

    #[test]
    fn repeated_exit_requests_share_one_settings_confirmation() {
        let mut policy = ClosePolicy::default();
        assert_eq!(policy.request_exit(0, true), CloseAction::RequestSettingsClose);
        assert_eq!(policy.request_exit(0, true), CloseAction::None);
        policy.settings_close_requested();
        assert_eq!(policy.resolve_settings_close(true, true), CloseAction::DestroySettings);
        assert_eq!(policy.resolve_settings_close(true, true), CloseAction::None);
        assert_eq!(policy.settings_destroyed(), CloseAction::Exit(0));
    }

    #[test]
    fn settings_close_alone_does_not_exit() {
        let mut policy = ClosePolicy::default();
        policy.settings_close_requested();
        assert_eq!(policy.resolve_settings_close(true, true), CloseAction::DestroySettings);
        assert_eq!(policy.settings_destroyed(), CloseAction::None);
    }

    #[test]
    fn cancel_exit_does_not_leak_into_a_later_settings_close() {
        let mut policy = ClosePolicy::default();
        assert_eq!(policy.request_exit(0, true), CloseAction::RequestSettingsClose);
        assert_eq!(policy.resolve_settings_close(false, true), CloseAction::None);
        policy.settings_close_requested();
        assert_eq!(policy.resolve_settings_close(true, true), CloseAction::DestroySettings);
        assert_eq!(policy.settings_destroyed(), CloseAction::None);
    }

    #[test]
    fn cancel_allows_a_later_exit_to_request_confirmation_again() {
        let mut policy = ClosePolicy::default();
        policy.request_exit(0, true);
        policy.resolve_settings_close(false, true);
        assert_eq!(policy.request_exit(7, true), CloseAction::RequestSettingsClose);
        assert_eq!(policy.resolve_settings_close(true, true), CloseAction::DestroySettings);
        assert_eq!(policy.settings_destroyed(), CloseAction::Exit(7));
    }

    #[test]
    fn main_close_joins_an_existing_settings_close() {
        let mut policy = ClosePolicy::default();
        policy.settings_close_requested();
        assert_eq!(policy.request_exit(0, true), CloseAction::None);
        policy.resolve_settings_close(true, true);
        assert_eq!(policy.settings_destroyed(), CloseAction::Exit(0));
    }

    #[test]
    fn settings_destroyed_before_js_listener_still_completes_exit() {
        let mut policy = ClosePolicy::default();
        policy.request_exit(0, true);
        assert_eq!(policy.settings_destroyed(), CloseAction::Exit(0));
        assert_eq!(policy.settings_destroyed(), CloseAction::None);
    }

    #[test]
    fn missing_settings_resolution_completes_exit_once() {
        let mut policy = ClosePolicy::default();
        policy.request_exit(0, true);
        assert_eq!(policy.resolve_settings_close(true, false), CloseAction::Exit(0));
        assert_eq!(policy.resolve_settings_close(true, false), CloseAction::None);
    }
}
