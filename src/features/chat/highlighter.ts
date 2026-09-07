import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import { createHighlighterCore, type ShikiTransformer } from "shiki/core";
import bash from "shiki/langs/bash.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import python from "shiki/langs/python.mjs";
import rust from "shiki/langs/rust.mjs";
import ts from "shiki/langs/ts.mjs";
import tsx from "shiki/langs/tsx.mjs";
import githubDarkDimmed from "shiki/themes/github-dark-dimmed.mjs";
import githubLight from "shiki/themes/github-light.mjs";

const DARK_THEME = "github-dark-dimmed";
const LIGHT_THEME = "github-light";

const SUPPORTED_LANGS: ReadonlySet<string> = new Set([
  "bash",
  "javascript",
  "json",
  "python",
  "rust",
  "ts",
  "tsx",
]);

const LANG_ALIASES: Record<string, string> = {
  cjs: "javascript",
  js: "javascript",
  mjs: "javascript",
  py: "python",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  typescript: "ts",
  zsh: "bash",
};

// The code surface comes from the muted token so blocks match the app
// palette; Shiki's per-theme background would fight it.
const STRIP_CODE_BACKGROUND: ShikiTransformer = {
  name: "nostra:strip-code-background",
  pre(node) {
    delete node.properties.style;
  },
};

// Module-level creation prewarms the grammars and themes on first import;
// the JavaScript regex engine avoids loading oniguruma WASM.
const highlighterPromise = createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  langs: [bash, javascript, json, python, rust, ts, tsx],
  themes: [githubDarkDimmed, githubLight],
});

/**
 * Highlights one complete code fence to an HTML string.
 * Constraint: unknown languages fall back to a plaintext block.
 * Failure: never rejects; engine failures also fall back to plaintext.
 */
export async function highlightCode(
  code: string,
  rawLanguage: string,
  isDark: boolean,
): Promise<string> {
  const language = normalizeLanguage(rawLanguage);
  try {
    const highlighter = await highlighterPromise;
    return highlighter.codeToHtml(code, {
      lang: language,
      theme: isDark ? DARK_THEME : LIGHT_THEME,
      transformers: [STRIP_CODE_BACKGROUND],
    });
  } catch {
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }
}

export function normalizeLanguage(rawLanguage: string): string {
  const lang = rawLanguage.trim().toLowerCase();
  const resolved = LANG_ALIASES[lang] ?? lang;
  return SUPPORTED_LANGS.has(resolved) ? resolved : "plaintext";
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
