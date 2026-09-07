import { queryOptions, useQuery } from "@tanstack/react-query";

import { getAppInfo } from "@/lib/ipc/app";

// Export when the first cross-file consumer (mutation invalidation) appears.
const appKeys = {
  all: ["app"] as const,
  info: () => [...appKeys.all, "info"] as const,
};

export function useAppInfo() {
  return useQuery(
    queryOptions({
      queryFn: getAppInfo,
      queryKey: appKeys.info(),
      // Package identity is immutable while the process runs.
      staleTime: Infinity,
    }),
  );
}
