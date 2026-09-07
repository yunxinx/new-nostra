import { describe, expect, it } from "vitest";

import { normalizeLanguage } from "./highlighter";

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
