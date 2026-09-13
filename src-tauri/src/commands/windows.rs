use serde::Deserialize;
use tauri::{window::Color, AppHandle, WebviewWindow};

use crate::{
    error::{AppError, ErrorCode},
    window_lifecycle,
};

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveSettingsCloseParams {
    pub accepted: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetWindowBackgroundParams {
    pub color: String,
}

#[tauri::command]
pub async fn resolve_settings_close(
    app: AppHandle,
    window: WebviewWindow,
    params: ResolveSettingsCloseParams,
) -> Result<(), AppError> {
    let result = if window.label() == "settings" {
        window_lifecycle::resolve_settings_close(&app, params.accepted)
    } else {
        Err(AppError {
            code: ErrorCode::InvalidInput,
            message: "only settings can resolve its close request".into(),
        })
    };
    super::log_command_failures("resolve_settings_close", result)
}

#[tauri::command]
pub async fn set_window_background(
    window: WebviewWindow,
    params: SetWindowBackgroundParams,
) -> Result<(), AppError> {
    let result = parse_window_background(&params.color).and_then(|color| {
        window.set_background_color(Some(color)).map_err(|error| AppError {
            code: ErrorCode::Internal,
            message: format!("native window background update failed: {error}"),
        })
    });
    super::log_command_failures("set_window_background", result)
}

fn parse_window_background(value: &str) -> Result<Color, AppError> {
    let invalid_color = || AppError {
        code: ErrorCode::InvalidInput,
        message: "window background must be an opaque #RRGGBB color".into(),
    };
    if value.len() != 7
        || !value.starts_with('#')
        || !value.bytes().skip(1).all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(invalid_color());
    }
    value.parse().map_err(|_| invalid_color())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_resolution_requires_a_boolean() {
        assert!(serde_json::from_str::<ResolveSettingsCloseParams>("{}").is_err());
        assert!(
            serde_json::from_str::<ResolveSettingsCloseParams>(r#"{"accepted":"true"}"#).is_err()
        );
        assert!(
            serde_json::from_str::<ResolveSettingsCloseParams>(r#"{"accepted":true}"#)
                .unwrap()
                .accepted
        );
    }

    #[test]
    fn window_background_requires_an_explicit_string() {
        for json in
            ["{}", r##"{"value":"#22272e"}"##, r#"{"color":null}"#, r#"{"color":[34,39,46]}"#]
        {
            assert!(serde_json::from_str::<SetWindowBackgroundParams>(json).is_err());
        }
    }

    #[test]
    fn window_background_preserves_the_palette_channels_and_opacity() {
        for (color, expected) in
            [("#22272e", Color(34, 39, 46, 255)), ("#ffffff", Color(255, 255, 255, 255))]
        {
            let params: SetWindowBackgroundParams =
                serde_json::from_value(serde_json::json!({ "color": color })).unwrap();
            assert_eq!(parse_window_background(&params.color).unwrap(), expected);
        }
    }

    #[test]
    fn window_background_rejects_invalid_or_translucent_colors() {
        for color in [
            "",
            "22272e",
            "#fff",
            "#ffffff00",
            "#gggggg",
            "#１２３",
            "#aéaaa",
            "#fff ff",
            " #ffffff",
        ] {
            assert_eq!(parse_window_background(color).unwrap_err().code, ErrorCode::InvalidInput);
        }
    }
}
