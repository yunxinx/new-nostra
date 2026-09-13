import type {
  ModelEntry,
  Provider,
  ProviderListItem,
  UnifiedMember,
} from "@/types/ipc";

/** One row of the aggregate model list: a model entry under its provider. */
export interface AggregateRow {
  model: ModelEntry;
  provider: Provider;
}

/** The two parts one member of a unified model is shown as. */
export interface MemberParts {
  /** The model's display name, or its request name. */
  model: string;
  /** The provider's name, or its id. */
  provider: string;
}

/** Filters of the aggregate list. */
export interface ModelListFilter {
  /** Protocol families; an empty list lets every protocol through. */
  protocols: string[];
  /** Provider ids; an empty list lets every provider through. */
  providerIds: string[];
  /** Free text over the display name and the request name. */
  search: string;
}

/** One provider's models in the aggregate list. */
export interface ModelListSection {
  provider: Provider;
  rows: AggregateRow[];
  /** Position of the section's first row in the whole list. */
  start: number;
}

/** The two-segment label of an aggregate row: provider name and model name. */
export function aggregateRowLabel(row: AggregateRow): string {
  return `${row.provider.name} / ${modelDisplayName(row.model)}`;
}

/** Rows of the aggregate list: every decodable provider's models in stored order. */
export function aggregateRows(providers: ProviderListItem[]): AggregateRow[] {
  const rows: AggregateRow[] = [];
  for (const item of providers) {
    if (!isProvider(item)) {
      continue;
    }
    for (const model of item.models ?? []) {
      rows.push({ model, provider: item });
    }
  }
  return rows;
}

/**
 * Whether a row passes the aggregate filters. An empty selection of a facet
 * is no selection at all, so a facet never filters everything out.
 */
export function matchesModelFilters(
  row: AggregateRow,
  filter: ModelListFilter,
): boolean {
  if (
    filter.providerIds.length > 0 &&
    !filter.providerIds.includes(row.provider.id)
  ) {
    return false;
  }
  if (
    filter.protocols.length > 0 &&
    !(row.model.apis ?? []).some((api) => filter.protocols.includes(api))
  ) {
    return false;
  }
  const search = filter.search.trim().toLowerCase();
  if (search !== "") {
    const haystack = [row.model.name, row.model.id].join(" ").toLowerCase();
    if (!haystack.includes(search)) {
      return false;
    }
  }
  return true;
}

/** The display name of a model: the stored name, else its upstream request name. */
export function modelDisplayName(model: ModelEntry): string {
  const name = model.name?.trim();
  return name === undefined || name === "" ? model.id : name;
}

/**
 * The rows grouped by provider, in the order the providers are stored. A
 * provider whose every model the filters drop contributes no section, so a
 * filtered list never shows an empty group. A section's start is its first
 * row's position in the whole list, so a row can be numbered across groups.
 */
export function sectionRows(rows: AggregateRow[]): ModelListSection[] {
  const sections: ModelListSection[] = [];
  let start = 0;
  for (const row of rows) {
    const last = sections.at(-1);
    if (last === undefined || last.provider.id !== row.provider.id) {
      sections.push({ provider: row.provider, rows: [], start });
    }
    const section = sections.at(-1);
    if (section === undefined) {
      continue;
    }
    section.rows.push(row);
    start += 1;
  }
  return sections;
}

/** Candidate rows of the unified member picker: enabled providers only. */
export function unifiedCandidateRows(
  providers: ProviderListItem[],
): AggregateRow[] {
  return aggregateRows(providers).filter((row) => row.provider.enabled);
}

/**
 * The display parts of one member: the provider it pins and the model it
 * names, each falling back to its stored id. A member is shown as two things
 * — the model, and a badge naming whose it is — so the parts come apart
 * rather than arriving pre-joined into one string.
 */
export function unifiedMemberParts(
  member: UnifiedMember,
  providers: ProviderListItem[],
): MemberParts {
  const provider = providerById(providers, member.providerId);
  const model = provider?.models?.find((entry) => entry.id === member.model);
  return {
    model: model === undefined ? member.model : modelDisplayName(model),
    provider: provider === undefined ? member.providerId : provider.name,
  };
}

/** Whether a list item decodes as a provider, not its corrupted placeholder. */
function isProvider(item: ProviderListItem): item is Provider {
  return !("corrupted" in item);
}

/** The stored provider a member pins, or undefined when it is gone. */
function providerById(
  providers: ProviderListItem[],
  providerId: string,
): Provider | undefined {
  return providers.find(
    (item): item is Provider => isProvider(item) && item.id === providerId,
  );
}
