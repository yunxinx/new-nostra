import { describe, expect, it } from "vitest";

import { highlightCode, normalizeLanguage } from "./highlighter";

describe("highlightCode", () => {
  it.each([true, false])("preserves code text with dark=%s", async (isDark) => {
    const code = 'const text = "<script>&</script>";\n\nconsole.log(text);\n';
    const tokens = await highlightCode(code, "ts", isDark);
    expect(tokens).not.toBeNull();
    expect(
      tokens
        ?.map((line) => line.map((token) => token.content).join(""))
        .join("\n"),
    ).toBe(code);
    expect(
      new Set(tokens?.flat().map((token) => token.style.color)).size,
    ).toBeGreaterThan(1);
  });

  it("preserves unknown-language text without interpreting markup", async () => {
    const code = '<img src=x onerror="alert(1)">\n& < >';
    const tokens = await highlightCode(code, "not-a-language", false);
    expect(
      tokens
        ?.map((line) => line.map((token) => token.content).join(""))
        .join("\n"),
    ).toBe(code);
  });
});

describe("normalizeLanguage", () => {
  it("maps common aliases to registered grammars", () => {
    expect(normalizeLanguage("js")).toBe("javascript");
    expect(normalizeLanguage("PY")).toBe("python");
    expect(normalizeLanguage("sh")).toBe("bash");
    expect(normalizeLanguage("TypeScript")).toBe("ts");
  });

  it("keeps registered language ids as-is", () => {
    expect(normalizeLanguage("rust")).toBe("rust");
    expect(normalizeLanguage("tsx")).toBe("tsx");
  });

  it("falls back to plaintext for unknown or empty languages", () => {
    expect(normalizeLanguage("")).toBe("plaintext");
    expect(normalizeLanguage("brainfuck")).toBe("plaintext");
  });
});
