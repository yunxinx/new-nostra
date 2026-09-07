import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import path from "node:path";
import process from "node:process";
/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig(() => {
  const host = process.env.TAURI_DEV_HOST;

  return {
    build: {
      rollupOptions: {
        input: {
          main: path.join(import.meta.dirname, "index.html"),
          settings: path.join(import.meta.dirname, "settings.html"),
        },
      },
    },

    // Don't obscure Rust panics behind Vite output.
    clearScreen: false,
    plugins: [
      react(),
      // React Compiler via the official babel plugin (the plugin-react native
      // `compiler: true` option is oxc-based and still experimental).
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
    ],
    // Rolldown resolves tsconfig `paths` at build time, but the dev dependency
    // scanner does not — without this alias the scan fails and pre-bundling is
    // skipped entirely.
    resolve: {
      alias: {
        "@": path.join(import.meta.dirname, "src"),
      },
    },
    server: {
      host: host || false,
      // Tauri expects a fixed port; fail instead of picking another one.
      port: 1420,
      strictPort: true,
      ...(host ? { hmr: { host, port: 1421, protocol: "ws" as const } } : {}),
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },
    test: {
      environment: "node",
    },
  };
});
