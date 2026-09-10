//! Provider configuration domain: validation, effective-value resolution and the
//! vendor catalog. Depends on `types.rs` and std/serde only — no command,
//! repository or Tauri types.

pub mod compat_defaults;
pub mod config;
pub mod vendors;
