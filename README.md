# Nostra

A desktop AI chat application built with Tauri v2 (Rust) and React 19 / TypeScript.

## Prerequisites

- Node.js 24+, pnpm 11+
- Rust stable toolchain
- Platform webview dependencies (see [Tauri prerequisites](https://tauri.app/start/prerequisites/))

## Development

```bash
pnpm install --frozen-lockfile
pnpm tauri dev
```

## Checks

```bash
pnpm check          # lint + format:check + typecheck + test + knip
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Cargo commands run from `src-tauri/`.
