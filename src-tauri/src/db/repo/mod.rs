//! Repository layer: one file per domain. Functions take `&Connection` or an
//! open `&Transaction`, run parameterized SQL, and return domain types from
//! `crate::types`; `rusqlite::Row` never leaks past this layer.

pub mod entries;
pub mod sessions;
