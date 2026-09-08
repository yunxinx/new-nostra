import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { windowBackgroundFor } from "./window-background";

// The native window background and the static config fallback must track the
// CSS `--background` token: index.css is the single authority, so a token
// change updates all three copies in one batch.
const indexCss = readFileSync(new URL("../index.css", import.meta.url), "utf8");

const tauriConf = JSON.parse(
  readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), {
    encoding: "utf8",
  }),
) as { app: { windows: Array<{ backgroundColor?: string; label: string }> } };

// Declaration order in index.css: :root (light) first, .dark second.
const tokenValues = [
  ...indexCss.matchAll(/--background: (#[0-9a-fA-F]{6});/g),
].map((match) => match[1]);

describe("windowBackgroundFor", () => {
  it("mirrors the :root and .dark --background token values", () => {
    expect(tokenValues).toEqual(["#ffffff", "#22272e"]);
    expect(windowBackgroundFor(false)).toBe(tokenValues[0]);
    expect(windowBackgroundFor(true)).toBe(tokenValues[1]);
  });

  it("matches the static main-window fallback in tauri.conf.json", () => {
    const mainWindow = tauriConf.app.windows.find(
      (window) => window.label === "main",
    );
    expect(mainWindow?.backgroundColor).toBe(windowBackgroundFor(true));
  });
});
