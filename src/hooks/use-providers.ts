import {
  type QueryClient,
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  AppError,
  Provider,
  ProviderListItem,
  ProviderPreset,
  Providers,
  UnifiedModel,
  UnifiedModelListItem,
} from "@/types/ipc";

import { useCommandMutation } from "@/hooks/use-command-mutation";
import {
  createProvider,
  type CreateProviderParams,
  createUnifiedModel,
  type CreateUnifiedModelParams,
  deleteProvider,
  type DeleteProviderParams,
  deleteUnifiedModel,
  type DeleteUnifiedModelParams,
  listProviderPresets,
  listProviders,
  listUnifiedModels,
  updateProvider,
  type UpdateProviderParams,
  updateUnifiedModel,
  type UpdateUnifiedModelParams,
} from "@/lib/ipc/providers";
import {
  providerPresetsKeys,
  providersKeys,
  unifiedModelsKeys,
} from "@/lib/query-keys";

interface ProviderPresetsResult {
  error: AppError | null;
  presets: ProviderPreset[];
  retry: () => void;
}

interface ProvidersResult {
  error: AppError | null;
  isLoading: boolean;
  providers: ProviderListItem[];
  retry: () => void;
}

interface UnifiedModelsResult {
  error: AppError | null;
  isLoading: boolean;
  retry: () => void;
  unifiedModels: UnifiedModelListItem[];
}

export function useCreateProvider() {
  const queryClient = useQueryClient();
  return useProviderMutation<Provider, CreateProviderParams>({
    mutationFn: createProvider,
    networkMode: "always",
    onSuccess: async () => {
      await invalidateProviderWrites(queryClient);
    },
    retry: false,
  });
}

export function useCreateUnifiedModel() {
  const queryClient = useQueryClient();
  return useProviderMutation<UnifiedModel, CreateUnifiedModelParams>({
    mutationFn: createUnifiedModel,
    networkMode: "always",
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: unifiedModelsKeys.all,
      });
    },
    retry: false,
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();
  return useCommandMutation<DeleteProviderParams>({
    mutationFn: deleteProvider,
    networkMode: "always",
    onSuccess: async () => {
      await invalidateProviderWrites(queryClient);
    },
    retry: false,
  });
}

export function useDeleteUnifiedModel() {
  const queryClient = useQueryClient();
  return useCommandMutation<DeleteUnifiedModelParams>({
    mutationFn: deleteUnifiedModel,
    networkMode: "always",
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: unifiedModelsKeys.all,
      });
    },
    retry: false,
  });
}

/**
 * The empty preset list, held as one value: `?? []` would hand every consumer a
 * fresh array while the read is pending, and a list that feeds a memo would
 * then invalidate it on every render.
 */
const NO_PRESETS: ProviderPreset[] = [];

/**
 * The built-in vendor presets, read once per session: they are app-version
 * constants, so no write can invalidate them.
 */
export function useProviderPresets(): ProviderPresetsResult {
  const query = useQuery<ProviderPreset[], AppError>({
    networkMode: "always",
    queryFn: listProviderPresets,
    queryKey: providerPresetsKeys.all,
    staleTime: Infinity,
  });
  return {
    error: query.error ?? null,
    presets: query.data ?? NO_PRESETS,
    retry: () => void query.refetch(),
  };
}

export function useProviders(): ProvidersResult {
  const query = useQuery<Providers, AppError>({
    networkMode: "always",
    queryFn: listProviders,
    queryKey: providersKeys.all,
    staleTime: Infinity,
  });
  return {
    error: query.error ?? null,
    isLoading: query.isLoading,
    providers: query.data?.providers ?? [],
    retry: () => void query.refetch(),
  };
}

export function useUnifiedModels(): UnifiedModelsResult {
  const query = useQuery<UnifiedModelListItem[], AppError>({
    networkMode: "always",
    queryFn: listUnifiedModels,
    queryKey: unifiedModelsKeys.all,
    staleTime: Infinity,
  });
  return {
    error: query.error ?? null,
    isLoading: query.isLoading,
    retry: () => void query.refetch(),
    unifiedModels: query.data ?? [],
  };
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useProviderMutation<Provider, UpdateProviderParams>({
    mutationFn: updateProvider,
    networkMode: "always",
    onSuccess: async (provider) => {
      // A failed refresh must not expose the pre-commit document to the next
      // editor. Cancel first so an older fetch cannot revert this merge.
      await queryClient.cancelQueries({ queryKey: providersKeys.all });
      queryClient.setQueryData<Providers>(providersKeys.all, (current) =>
        current === undefined
          ? undefined
          : {
              providers: current.providers.map((item) =>
                item.id === provider.id ? provider : item,
              ),
            },
      );
      await invalidateProviderWrites(queryClient);
    },
    retry: false,
  });
}

export function useUpdateUnifiedModel() {
  const queryClient = useQueryClient();
  return useProviderMutation<UnifiedModel, UpdateUnifiedModelParams>({
    mutationFn: updateUnifiedModel,
    networkMode: "always",
    onSuccess: async (unified, variables) => {
      // The write's own document is the result: swapping the row the request
      // addressed — by the id it named, which is the old one on a rename —
      // keeps the list off its pre-write shape while the refresh runs.
      await queryClient.cancelQueries({ queryKey: unifiedModelsKeys.all });
      queryClient.setQueryData<UnifiedModelListItem[]>(
        unifiedModelsKeys.all,
        (current) =>
          current?.map((item) =>
            !("corrupted" in item) && item.id === variables.id ? unified : item,
          ),
      );
      await queryClient.invalidateQueries({
        queryKey: unifiedModelsKeys.all,
      });
    },
    retry: false,
  });
}

// Provider writes reshape the model directory that unified-model members pin by
// id (renamed models or a removed provider shrink members), so the unified
// list is invalidated alongside the provider list.
async function invalidateProviderWrites(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: providersKeys.all });
  await queryClient.invalidateQueries({ queryKey: unifiedModelsKeys.all });
}

// Mutations reject with the serialized AppError rather than an Error instance,
// so the wrapper pins TError for callers branching on `error.code`.
function useProviderMutation<TData, TVariables, TContext = unknown>(
  options: UseMutationOptions<TData, AppError, TVariables, TContext>,
): UseMutationResult<TData, AppError, TVariables, TContext> {
  return useMutation(options);
}
