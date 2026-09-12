import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { listenProviderCatalogChanges } from "@/lib/ipc/provider-events";
import { providersKeys, unifiedModelsKeys } from "@/lib/query-keys";

export function useProviderCatalogSync(): void {
  const client = useQueryClient();
  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | undefined;
    function invalidate(): void {
      if (isDisposed) return;
      for (const queryKey of [providersKeys.all, unifiedModelsKeys.all]) {
        // Invalidation alone reuses an in-flight first read, which can predate the commit.
        void client.cancelQueries({ queryKey }).then(() => {
          if (!isDisposed) void client.invalidateQueries({ queryKey });
        });
      }
    }
    void listenProviderCatalogChanges(invalidate)
      .then((dispose) => {
        if (isDisposed) dispose();
        else {
          unlisten = dispose;
          invalidate();
        }
      })
      .catch((error: unknown) =>
        console.error("Catalog listener registration failed", error),
      );
    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [client]);
}
