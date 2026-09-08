import type { CSSProperties } from "react";

import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import {
  createHighlighterCore,
  getTokenStyleObject,
  type ThemedToken,
} from "shiki/core";
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

export interface HighlightedToken {
  content: string;
  offset: number;
  style: CSSProperties;
}

// Module-level creation prewarms the grammars and themes on first import;
// the JavaScript regex engine avoids loading oniguruma WASM.
const highlighterPromise = createHighlighterCore({
  engine: createJavaScriptRegexEngine(),
  langs: [bash, javascript, json, python, rust, ts, tsx],
  themes: [githubDarkDimmed, githubLight],
});

/**
 * Tokenizes one complete code fence for React rendering.
 * Constraint: unknown languages fall back to a plaintext block.
 * Failure: returns null on engine failure so the caller renders plain text.
 */
export async function highlightCode(
  code: string,
  rawLanguage: string,
  isDark: boolean,
): Promise<HighlightedToken[][] | null> {
  const language = normalizeLanguage(rawLanguage);
  try {
    const highlighter = await highlighterPromise;
    const { tokens } = highlighter.codeToTokens(code, {
      lang: language,
      theme: isDark ? DARK_THEME : LIGHT_THEME,
    });
    return tokens.map((line) =>
      line.map((token) => ({
        content: token.content,
        offset: token.offset,
        style: tokenStyle(token),
      })),
    );
  } catch {
    return null;
  }
}

export function normalizeLanguage(rawLanguage: string): string {
  const lang = rawLanguage.trim().toLowerCase();
  const resolved = LANG_ALIASES[lang] ?? lang;
  return SUPPORTED_LANGS.has(resolved) ? resolved : "plaintext";
}

function tokenStyle(token: ThemedToken): CSSProperties {
  const styles = getTokenStyleObject(token);
  return {
    backgroundColor: styles["background-color"],
    color: styles.color,
    fontStyle: styles["font-style"] === "italic" ? "italic" : undefined,
    fontWeight: styles["font-weight"] === "bold" ? "bold" : undefined,
    textDecoration: styles["text-decoration"],
  };
}
