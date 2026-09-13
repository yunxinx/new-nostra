import type { IconType } from "@lobehub/icons/es/types";

// The glyphs are taken from each icon's `Mono` component rather than from the
// icon's own entry: the entry also exports a `Combine` (glyph plus wordmark)
// that pulls in `@lobehub/ui`, which costs a dev-server pre-bundle of antd and
// fails outright under the test runner's native ESM. `Mono` draws in
// `currentColor`, so the tone below is what colours it.
import Claude from "@lobehub/icons/es/Claude/components/Mono";
import DeepSeek from "@lobehub/icons/es/DeepSeek/components/Mono";
import Kimi from "@lobehub/icons/es/Kimi/components/Mono";
import Ollama from "@lobehub/icons/es/Ollama/components/Mono";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono";
import OpenRouter from "@lobehub/icons/es/OpenRouter/components/Mono";

import type { ProviderPreset } from "@/types/ipc";

// Which glyph stands for each built-in vendor and each protocol family, and
// the colour it is drawn in. A mark is deliberately not a palette token: it
// keeps the brand's identity in both themes. A raw brand colour is not
// readable on every surface all the same — OpenRouter's lime is 1.2:1 on
// white, OpenAI's knot is invisible on the dark canvas — so each colour is the
// brand's own value wherever that clears the bar, and the smallest move off it
// where it does not. The bar fits the job: 3:1 for a colour that only draws a
// glyph, 4.5:1 for one that also carries text. `brand-marks.test.ts` holds the
// table to both, on the light theme's white canvas and on the dark theme's
// popover.

interface BrandMark {
  Icon: IconType;
  /** Colour the glyph is drawn in. */
  tone: string;
}

interface ProtocolMark {
  Icon: IconType;
  /** Colour of the glyph and of any text that stands for the family. */
  tone: string;
  /** Wash and text of a pill that stands for the family. */
  wash: string;
}

/**
 * Two presets wear their product's mark instead of the house one: Anthropic's
 * is a cream monogram and Moonshot's a near-black one, neither of which
 * survives as a glyph, while the products those profiles carry — Claude, Kimi
 * — are both recognisable and already coloured. OpenAI and Ollama have no
 * chromatic mark to reach for, so theirs follow the surface they sit on rather
 * than taking a colour the brand never uses.
 */
const VENDOR_MARKS: Record<string, BrandMark> = {
  anthropic: { Icon: Claude, tone: "text-[#d97757]" },
  deepseek: { Icon: DeepSeek, tone: "text-[#4d6bfe] dark:text-[#5370fe]" },
  moonshot: { Icon: Kimi, tone: "text-[#1783ff]" },
  ollama: { Icon: Ollama, tone: "text-black dark:text-white" },
  openai: { Icon: OpenAI, tone: "text-black dark:text-white" },
  openrouter: { Icon: OpenRouter, tone: "text-[#7c9e00] dark:text-[#c8ff00]" },
};

/**
 * The preset ids that have a mark, for the checks that hold every mark to the
 * contrast floors.
 */
export const MARKED_PRESETS = Object.keys(VENDOR_MARKS);

/**
 * Family to mark. Both OpenAI families carry the same glyph, so the colour is
 * what tells them apart: chat completions takes the classic GPT green,
 * responses the OSS blue, both out of OpenAI's own palette.
 */
const PROTOCOL_MARKS: Record<string, ProtocolMark> = {
  "anthropic-messages": {
    Icon: Claude,
    tone: "text-[#ae6046] dark:text-[#dd8568]",
    wash: "border-transparent bg-[#ae6046]/12 text-[#ae6046] dark:bg-[#dd8568]/12 dark:text-[#dd8568]",
  },
  "openai-completions": {
    Icon: OpenAI,
    tone: "text-[#118556] dark:text-[#19c37d]",
    wash: "border-transparent bg-[#118556]/12 text-[#118556] dark:bg-[#19c37d]/12 dark:text-[#19c37d]",
  },
  "openai-responses": {
    Icon: OpenAI,
    tone: "text-[#0078c9] dark:text-[#15a2ff]",
    wash: "border-transparent bg-[#0078c9]/12 text-[#0078c9] dark:bg-[#15a2ff]/12 dark:text-[#15a2ff]",
  },
};

/**
 * The preset whose own address a stored provider still points at, or null when
 * it points anywhere else. A provider does not record the vendor it came from,
 * so the mark is read back from the address; the match is exact (host and port
 * both) and deliberately stricter than the backend's vendor detection, which
 * matches host suffixes and lists a few aliases of its own. A mark therefore
 * means "this still answers exactly where the preset does" — a provider moved
 * to a proxy, a regional endpoint or a host alias goes unmarked rather than
 * wearing a mark that promises more than the address does.
 */
export function presetIdForBaseUrl(
  baseUrl: string,
  presets: ProviderPreset[],
): null | string {
  const host = urlHost(baseUrl);
  if (host === null) {
    return null;
  }
  return (
    presets.find((preset) => urlHost(preset.baseUrl) === host)?.presetId ?? null
  );
}

/** The mark of a protocol family; undefined for a name no family claims. */
export function protocolMark(family: string): ProtocolMark | undefined {
  return Object.hasOwn(PROTOCOL_MARKS, family)
    ? PROTOCOL_MARKS[family]
    : undefined;
}

/**
 * The mark of a built-in vendor preset; undefined for a provider that stands
 * for no vendor. Keyed by preset id rather than opened up as a lookup table so
 * that a name like `constructor` answers undefined instead of finding
 * something on `Object.prototype`.
 */
export function vendorMark(presetId: null | string): BrandMark | undefined {
  return presetId !== null && Object.hasOwn(VENDOR_MARKS, presetId)
    ? VENDOR_MARKS[presetId]
    : undefined;
}

/** The host of a URL, port included: Ollama's `localhost:11434` is a host. */
function urlHost(url: string): null | string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}
