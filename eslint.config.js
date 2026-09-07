// @ts-check
import eslint from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import perfectionist from "eslint-plugin-perfectionist";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    // Local-only AI/tooling dirs are git-excluded (see .git/info/exclude); they
    // are not part of the app and not linted.
    ignores: [
      "dist",
      "coverage",
      "src-tauri",
      "myNotes",
      ".agents",
      ".claude",
      ".codebuddy",
      ".codex",
      ".cursor",
      ".pi",
      ".qoder",
      ".trellis",
      ".zcode",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // eslint.config.js is not part of the tsconfig project (no allowJs);
        // allowDefaultProject covers exactly this kind of root config file.
        projectService: {
          allowDefaultProject: ["eslint.config.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Includes the React Compiler (Rules-of-React) diagnostics; exhaustive-deps errors.
  reactHooks.configs.flat["recommended-latest"],
  reactRefresh.configs.vite,
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": "warn",
    },
  },
  perfectionist.configs["recommended-natural"],
  {
    rules: {
      // Arrow shorthand returning void is the canonical zustand/action shape.
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],
      "@typescript-eslint/no-unnecessary-type-parameters": "warn",
    },
  },
  {
    // shadcn generated components export cva variant helpers alongside the
    // component; fast-refresh single-export rule does not apply there.
    files: ["src/components/ui/**"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
    },
  },
  prettierConfig,
);
