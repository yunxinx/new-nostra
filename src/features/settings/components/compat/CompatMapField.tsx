import type { ReactNode } from "react";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { JsonValue } from "@/types/ipc";

import { isDeepEqual } from "@/lib/deep-equal";

import { KeyValueEditor, type KeyValueRow } from "../KeyValueEditor";
import { canonicalMapOverride } from "./compat-draft";
import {
  formatJsonValue,
  type MapFields,
  mapRecord,
  mergeObjectValue,
  parseCellText,
} from "./compat-values";

interface CompatMapFieldProps {
  /**
   * The row's provenance tag and its restore action, on the heading beside the
   * name: the table below fills the row's whole width, so the two cannot share
   * a line with the control the way an inline row does.
   */
  actions?: ReactNode;
  /** This layer's saved override, which the commit's representation rule reads. */
  baseline?: JsonValue | undefined;
  /** What this field is for, shown beside its name. */
  info?: string | undefined;
  /**
   * Effective values of the layers below, key by key; a key this layer does not
   * override reads its value from here, and a key both hold merges them.
   */
  inherited: JsonValue | undefined;
  label: string;
  onChange: (value: MapFields | null) => void;
  /** Puts the field back to its stored value. */
  onRevert?: (() => void) | undefined;
  /** This layer's own override; absent while the field is unset here. */
  value: JsonValue | undefined;
}

/** One row of the merged map as the editor holds it. */
interface CompatMapRow extends KeyValueRow {
  isInherited: boolean;
}

/** The two layers a row is reconciled against. */
interface MapLayers {
  inherited: MapFields;
  own: MapFields;
}

interface MapState {
  /**
   * The own map this component's own last change hands the parent. The write's
   * echo moves keys without being an external change, so it never rewrites the
   * text of the row it came from.
   */
  emitted: MapFields;
  rows: CompatMapRow[];
  /** The layers the rows were last brought in step with. */
  seen: MapLayers;
}

// One map compat field, shown as the merge the request layer builds: every key
// of this layer and of the layers below gets a row, a key both hold reads the
// value the merge produces, and the rows this layer does not own are marked
// instead of removable. Editing any row writes this layer's own override; the
// rows themselves stay local state so a row whose key is still blank, or one
// whose value is only half typed, neither disappears nor gets rewritten by a
// resolve that lands underneath it.
export function CompatMapField({
  actions,
  baseline,
  info,
  inherited,
  label,
  onChange,
  onRevert,
  value,
}: CompatMapFieldProps) {
  const { t } = useTranslation();
  const own = mapRecord(value);
  const below = mapRecord(inherited);
  const [state, setState] = useState<MapState>(() => ({
    emitted: own,
    rows: reconciledRows(EMPTY_STATE, own, below),
    seen: { inherited: below, own },
  }));
  if (
    !isDeepEqual(state.seen.own, own) ||
    !isDeepEqual(state.seen.inherited, below)
  ) {
    setState({
      ...state,
      rows: reconciledRows(state, own, below),
      seen: { inherited: below, own },
    });
  }

  function commit(rows: KeyValueRow[]): void {
    const emitted = canonicalMapOverride(
      candidateOf(rows, own, below),
      mapRecord(baseline),
      below,
    );
    setState({
      ...state,
      emitted,
      rows: oneRowPerKey(rows, own, below).map((row) => ({
        ...row,
        isInherited: isBelowKey(row.key, emitted, below),
      })),
    });
    onChange(Object.keys(emitted).length === 0 ? null : emitted);
  }

  return (
    <KeyValueEditor
      actions={actions}
      addLabel={t("settings.providers.compatAddMapEntry")}
      info={info}
      inheritedLabel={t("settings.providers.compatInherited")}
      keyLabel={t("settings.providers.compatMapKey")}
      label={label}
      onChange={commit}
      onRevert={onRevert}
      removeLabel={t("settings.providers.compatRemoveMapEntry")}
      rows={state.rows}
      valueLabel={t("settings.providers.compatMapValue")}
    />
  );
}

/**
 * The candidate this layer would submit for the rows as they stand: an edited
 * row carries its cell's text parsed — an object edited against the merged view
 * materialises that whole view — an untouched own row keeps its stored fragment
 * (so a partly overridden object keeps following the layers below), and a row
 * only the layers below hold is not this layer's to submit.
 */
function candidateOf(
  rows: readonly KeyValueRow[],
  own: MapFields,
  inherited: MapFields,
): MapFields {
  const candidate: MapFields = {};
  for (const row of rows) {
    if (row.key.trim() === "") {
      continue;
    }
    const ownValue = own[row.key];
    if (row.value !== shownText(row, own, inherited)) {
      candidate[row.key] = parseCellText(row.value);
      continue;
    }
    if (ownValue !== undefined) {
      candidate[row.key] = ownValue;
    }
  }
  return candidate;
}

/** Whether a commit reads this row's own value, rather than leaving its key below. */
function carriesValue(
  row: KeyValueRow,
  own: MapFields,
  inherited: MapFields,
): boolean {
  return (
    Object.hasOwn(own, row.key) || row.value !== shownText(row, own, inherited)
  );
}

/** A fresh row for one key, in step with the layers it mirrors. */
function entryRow(
  key: string,
  ownValue: JsonValue | undefined,
  inheritedValue: JsonValue | undefined,
): CompatMapRow {
  return {
    id: crypto.randomUUID(),
    isInherited: ownValue === undefined,
    key,
    value: formatJsonValue(entryValue(ownValue, inheritedValue)),
  };
}

/** One key's effective value: this layer's fragment over the layer below. */
function entryValue(
  own: JsonValue | undefined,
  inherited: JsonValue | undefined,
): JsonValue | undefined {
  if (own === undefined || own === null) {
    return inherited;
  }
  return mergeObjectValue(inherited, own);
}

/** Whether a row's key is the layer below's to own, and so not removable here. */
function isBelowKey(
  key: string,
  own: MapFields,
  inherited: MapFields,
): boolean {
  return (
    key.trim() !== "" &&
    !Object.hasOwn(own, key) &&
    Object.hasOwn(inherited, key)
  );
}

/**
 * One row per key, the way a map holds one value per key. A repeated key keeps
 * the row the commit reads a value from, so a row renamed onto a key of the
 * layer below does not leave that key's previous row on the table.
 */
function oneRowPerKey(
  rows: readonly KeyValueRow[],
  own: MapFields,
  inherited: MapFields,
): KeyValueRow[] {
  const last = new Map<string, KeyValueRow>();
  const lastCarrying = new Map<string, KeyValueRow>();
  for (const row of rows) {
    if (row.key.trim() === "") {
      continue;
    }
    last.set(row.key, row);
    if (carriesValue(row, own, inherited)) {
      lastCarrying.set(row.key, row);
    }
  }
  return rows.filter((row) => {
    if (row.key.trim() === "") {
      return true;
    }
    return (lastCarrying.get(row.key) ?? last.get(row.key)) === row;
  });
}

/** The state a map opens with, before any row mirrors a key. */
const EMPTY_STATE: MapState = {
  emitted: {},
  rows: [],
  seen: { inherited: {}, own: {} },
};

/**
 * The rows brought in step with the two layers: the keys of this layer and of
 * the layers below all get a row — this layer's own keys first, the rest after
 * — and the rows already held keep their place, their text and their focus.
 * Only a key's own value in either layer moving rewrites its text, and a write
 * this component itself just made is not such a move: its echo brings the row
 * set in step while the cell keeps what the user typed. A key that left both
 * layers takes its row with it, while a key neither ever held is a row still
 * being composed and stays. A key repeated across rows leaves one row, since a
 * map holds one value per key.
 */
function reconciledRows(
  state: MapState,
  own: MapFields,
  inherited: MapFields,
): CompatMapRow[] {
  const { seen } = state;
  const isEcho = isDeepEqual(own, state.emitted);
  const next: CompatMapRow[] = [];
  const held = new Set<string>();
  for (const row of [...state.rows].reverse()) {
    const key = row.key;
    if (key.trim() === "") {
      next.push(row);
      continue;
    }
    if (held.has(key)) {
      continue;
    }
    held.add(key);
    const ownValue = own[key];
    const inheritedValue = inherited[key];
    if (ownValue === undefined && inheritedValue === undefined) {
      if (
        !Object.hasOwn(seen.own, key) &&
        !Object.hasOwn(seen.inherited, key)
      ) {
        next.push(row);
      }
      continue;
    }
    const moved =
      !isDeepEqual(inheritedValue, seen.inherited[key]) ||
      (!isEcho && !isDeepEqual(ownValue, seen.own[key]));
    next.push({
      ...row,
      isInherited: ownValue === undefined,
      value: moved
        ? formatJsonValue(entryValue(ownValue, inheritedValue))
        : row.value,
    });
  }
  next.reverse();
  for (const [key, value] of Object.entries(own)) {
    if (!held.has(key)) {
      held.add(key);
      next.push(entryRow(key, value, inherited[key]));
    }
  }
  for (const [key, value] of Object.entries(inherited)) {
    if (!held.has(key)) {
      held.add(key);
      next.push(entryRow(key, undefined, value));
    }
  }
  return next;
}

/** The text a row shows while nothing about it has been edited. */
function shownText(
  row: KeyValueRow,
  own: MapFields,
  inherited: MapFields,
): string {
  return formatJsonValue(entryValue(own[row.key], inherited[row.key]));
}
