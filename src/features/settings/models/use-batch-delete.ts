import { useRef, useState } from "react";

interface DeleteTarget {
  keys: string[];
  label: string;
  remove: () => Promise<unknown>;
}

export function useBatchDelete() {
  const pending = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);

  async function run(
    targets: DeleteTarget[],
    onRemoved: (keys: string[]) => void,
  ): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    setIsDeleting(true);
    setFailures([]);
    const failed: string[] = [];
    try {
      for (const target of targets) {
        try {
          await target.remove();
          onRemoved(target.keys);
        } catch {
          failed.push(target.label);
        }
      }
    } finally {
      setFailures(failed);
      pending.current = false;
      setIsDeleting(false);
    }
  }

  return { failures, isDeleting, run };
}
