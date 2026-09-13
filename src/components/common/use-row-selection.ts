import { useCallback, useMemo, useState } from "react";

export interface RowSelection {
  clear: () => void;
  /** How many rows are selected. */
  count: number;
  isSelected: (key: string) => boolean;
  /** Drops the keys a list no longer holds, so a stale key cannot act. */
  prune: (liveKeys: readonly string[]) => void;
  /** The selected keys, in insertion order. */
  selected: string[];
  setMany: (keys: readonly string[], selected: boolean) => void;
  toggle: (key: string) => void;
}

/**
 * Which rows of a table are ticked. Rows are addressed by a key the caller
 * derives from the row, so a selection survives the reordering, filtering and
 * re-fetching that a table undergoes while it is on screen, and a row that
 * disappears simply stops being part of it.
 */
export function useRowSelection(): RowSelection {
  const [keys, setKeys] = useState<readonly string[]>([]);

  const toggle = useCallback((key: string) => {
    setKeys((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
    );
  }, []);

  const setMany = useCallback((targets: readonly string[], next: boolean) => {
    setKeys((current) => {
      if (!next) {
        return current.filter((entry) => !targets.includes(entry));
      }
      return [
        ...current.filter((entry) => !targets.includes(entry)),
        ...targets,
      ];
    });
  }, []);

  const clear = useCallback(() => setKeys([]), []);

  const prune = useCallback((liveKeys: readonly string[]) => {
    setKeys((current) => current.filter((key) => liveKeys.includes(key)));
  }, []);

  const selected = useMemo(() => [...keys], [keys]);

  return useMemo(
    () => ({
      clear,
      count: keys.length,
      isSelected: (key: string) => keys.includes(key),
      prune,
      selected,
      setMany,
      toggle,
    }),
    [clear, keys, prune, selected, setMany, toggle],
  );
}
