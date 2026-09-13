import { describe, expect, it } from "vitest";

import type { ProviderPreset } from "@/types/ipc";

import { parseHex, ratio } from "@/features/appearance/contrast";

import {
  MARKED_PRESETS,
  presetIdForBaseUrl,
  protocolMark,
  vendorMark,
} from "./brand-marks";
import { PROTOCOL_FAMILIES } from "./protocols";

const OLLAMA: ProviderPreset = {
  api: "openai-completions",
  baseUrl: "http://localhost:11434/v1",
  compat: {},
  headers: {},
  models: [],
  name: "Ollama",
  presetId: "ollama",
};

const OPENAI: ProviderPreset = {
  api: "openai-responses",
  baseUrl: "https://api.openai.com/v1",
  compat: {},
  headers: {},
  models: [],
  name: "OpenAI",
  presetId: "openai",
};

const PRESETS = [OPENAI, OLLAMA];

// The surfaces a mark is drawn on, from the two palettes' own values: both
// themes paint the canvas and the popovers the same colour.
const LIGHT_SURFACE = "#ffffff";
const DARK_SURFACE = "#2d333b";

/**
 * A brand colour is only usable as a small glyph at 3:1; once it carries the
 * family's name in a badge it is text, and text takes 4.5:1. The mark tables
 * are held to those two bars because a raw brand colour clears neither on
 * every surface — OpenRouter's lime is 1.2:1 on white.
 */
const MIN_GLYPH_CONTRAST = 3;
const MIN_TEXT_CONTRAST = 4.5;

/** How far a step stands out from the surface it is drawn on. */
function onSurface(hex: string, surface: string): number {
  return ratio(parseHex(hex), parseHex(surface));
}

/** The light step of a class string, and the dark step when it names one. */
function steps(classes: string): { dark: string; light: null | string } {
  const dark = /dark:[a-z-]*\[(#[0-9a-f]{6})\]/.exec(classes)?.[1] ?? "";
  const light =
    [...classes.matchAll(/#[0-9a-f]{6}/g)]
      .map((match) => match[0])
      .find((hex) => hex !== dark) ?? null;
  return { dark, light };
}

describe("brand marks", () => {
  it("knows a preset id, a protocol family, and nothing off the prototype", () => {
    expect(vendorMark("openai")).toBeDefined();
    expect(protocolMark("openai-responses")).toBeDefined();
    expect(vendorMark("constructor")).toBeUndefined();
    expect(vendorMark(null)).toBeUndefined();
    expect(protocolMark("toString")).toBeUndefined();
  });

  it("draws a vendor mark legibly on both surfaces", () => {
    for (const presetId of MARKED_PRESETS) {
      const { dark, light } = steps(vendorMark(presetId)?.tone ?? "");
      // A mark held in a plain black or white carries no hex to check.
      if (light === null) continue;
      expect(onSurface(light, LIGHT_SURFACE)).toBeGreaterThanOrEqual(
        MIN_GLYPH_CONTRAST,
      );
      expect(
        onSurface(dark === "" ? light : dark, DARK_SURFACE),
      ).toBeGreaterThanOrEqual(MIN_GLYPH_CONTRAST);
    }
  });

  it("draws a protocol family, and the label beside it, legibly on both surfaces", () => {
    for (const family of PROTOCOL_FAMILIES) {
      const mark = protocolMark(family);
      const { dark, light } = steps(mark?.tone ?? "");
      expect(light).not.toBeNull();
      // A family's colour is text: it carries the label in the pill as well as
      // drawing the glyph, so it takes the text bar in both themes.
      const darkStep = dark === "" ? (light ?? "") : dark;
      expect(onSurface(light ?? "", LIGHT_SURFACE)).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
      expect(onSurface(darkStep, DARK_SURFACE)).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
      // The pill is tinted with that same colour, in both steps.
      expect(mark?.wash).toContain(`text-[${light ?? ""}]`);
      expect(mark?.wash).toContain(`dark:text-[${darkStep}]`);
    }
  });
});

describe("presetIdForBaseUrl", () => {
  it("matches on the host, not on the path", () => {
    expect(presetIdForBaseUrl("https://api.openai.com/v1/", PRESETS)).toBe(
      "openai",
    );
    expect(presetIdForBaseUrl("https://API.OpenAI.com", PRESETS)).toBe(
      "openai",
    );
  });

  it("keeps the port, so a host that carries one is not another host", () => {
    expect(presetIdForBaseUrl("http://127.0.0.1:11434/v1", PRESETS)).toBeNull();
    expect(presetIdForBaseUrl("http://localhost:11434", PRESETS)).toBe(
      "ollama",
    );
    expect(presetIdForBaseUrl("http://localhost:9999/v1", PRESETS)).toBeNull();
  });

  it("answers null for an unknown or unreadable address", () => {
    expect(presetIdForBaseUrl("https://relay.example/v1", PRESETS)).toBeNull();
    expect(presetIdForBaseUrl("api.openai.com/v1", PRESETS)).toBeNull();
    expect(presetIdForBaseUrl("", PRESETS)).toBeNull();
  });
});
