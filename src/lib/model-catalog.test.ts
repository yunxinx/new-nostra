import { describe, expect, it } from "vitest";

import type { Provider, ProviderListItem } from "@/types/ipc";

import {
  aggregateRowLabel,
  aggregateRows,
  matchesModelFilters,
  modelDisplayName,
  type ModelListFilter,
  unifiedCandidateRows,
  unifiedMemberParts,
} from "./model-catalog";

/** A stored provider row with the fields every row carries. */
function provider(overrides: Partial<Provider>): Provider {
  return {
    abortOnDisconnect: true,
    api: "openai-completions",
    apiKey: "",
    baseUrl: "https://gateway.example",
    enabled: true,
    id: "p1",
    maxRetries: 2,
    name: "Gateway",
    reasoningOutput: "auto",
    requestTimeoutMs: 120000,
    streamIdleTimeoutMs: 120000,
    ...overrides,
  };
}

function rowIds(
  rows: Array<{ model: { id: string }; provider: { id: string } }>,
): string[] {
  return rows.map((row) => `${row.provider.id}/${row.model.id}`);
}

describe("aggregateRows", () => {
  it("keeps every provider's models in stored order and skips corrupted rows", () => {
    const providers: ProviderListItem[] = [
      provider({
        id: "p1",
        models: [
          { id: "a", reasoning: false },
          { id: "b", reasoning: false },
        ],
      }),
      { corrupted: true, id: "p2" },
      provider({ id: "p3", models: [{ id: "c", reasoning: false }] }),
    ];
    expect(rowIds(aggregateRows(providers))).toEqual(["p1/a", "p1/b", "p3/c"]);
  });
});

describe("modelDisplayName", () => {
  it("falls back to the request name for a blank display name", () => {
    expect(modelDisplayName({ id: "m1", reasoning: false })).toBe("m1");
    expect(modelDisplayName({ id: "m1", name: "", reasoning: false })).toBe(
      "m1",
    );
    expect(modelDisplayName({ id: "m1", name: "  ", reasoning: false })).toBe(
      "m1",
    );
    expect(modelDisplayName({ id: "m1", name: "Fast", reasoning: false })).toBe(
      "Fast",
    );
  });
});

describe("aggregateRowLabel", () => {
  it("joins the provider name and the model display name", () => {
    const row = {
      model: { id: "m1", name: "Fast", reasoning: false },
      provider: provider({ name: "Alpha" }),
    };
    expect(aggregateRowLabel(row)).toBe("Alpha / Fast");
  });
});

describe("matchesModelFilters", () => {
  const row = {
    model: {
      apis: ["openai-completions"],
      id: "gpt-5",
      name: "GPT-5",
      reasoning: false,
    },
    provider: provider({ id: "p1", name: "Alpha" }),
  };
  const pass = (filter: ModelListFilter): boolean =>
    matchesModelFilters(row, filter);

  it("searches the display name and the request name case-insensitively", () => {
    expect(pass({ protocols: [], providerIds: [], search: "gpt-5" })).toBe(
      true,
    );
    expect(pass({ protocols: [], providerIds: [], search: "GPT-5" })).toBe(
      true,
    );
    expect(pass({ protocols: [], providerIds: [], search: "missing" })).toBe(
      false,
    );
  });

  it("filters by provider and protocol", () => {
    expect(
      pass({ protocols: ["openai-completions"], providerIds: [], search: "" }),
    ).toBe(true);
    expect(
      pass({ protocols: ["anthropic-messages"], providerIds: [], search: "" }),
    ).toBe(false);
    expect(pass({ protocols: [], providerIds: ["p1"], search: "" })).toBe(true);
    expect(pass({ protocols: [], providerIds: ["other"], search: "" })).toBe(
      false,
    );
  });

  it("lets every row through when no facet is selected", () => {
    expect(
      pass({
        protocols: ["anthropic-messages"],
        providerIds: [],
        search: "",
      }),
    ).toBe(false);
    expect(pass({ protocols: [], providerIds: [], search: "" })).toBe(true);
  });
});

describe("unifiedCandidateRows", () => {
  it("lists only enabled providers' rows", () => {
    const providers: ProviderListItem[] = [
      provider({
        enabled: true,
        id: "p1",
        models: [{ id: "m1", reasoning: false }],
      }),
      provider({
        enabled: false,
        id: "p2",
        models: [{ id: "m2", reasoning: false }],
      }),
    ];
    expect(rowIds(unifiedCandidateRows(providers))).toEqual(["p1/m1"]);
  });
});

describe("unifiedMemberParts", () => {
  it("shows the provider name and the model display name", () => {
    const providers: ProviderListItem[] = [
      provider({
        id: "p1",
        models: [{ id: "m1", name: "Fast", reasoning: false }],
        name: "Alpha",
      }),
    ];
    expect(
      unifiedMemberParts({ model: "m1", providerId: "p1" }, providers),
    ).toEqual({ model: "Fast", provider: "Alpha" });
  });

  it("falls back to the stored ids when the provider or model is gone", () => {
    expect(unifiedMemberParts({ model: "gone", providerId: "p9" }, [])).toEqual(
      { model: "gone", provider: "p9" },
    );
  });
});
