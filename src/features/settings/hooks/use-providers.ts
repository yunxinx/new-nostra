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
  DefaultModel,
  Provider,
  ProviderListItem,
  Providers,
  UnifiedModel,
  UnifiedModelListItem,
} from "@/types/ipc";

import {
  clearDefaultModel,
  createProvider,
  type CreateProviderParams,
  createUnifiedModel,
  type CreateUnifiedModelParams,
  deleteProvider,
  type DeleteProviderParams,
  deleteUnifiedModel,
  type DeleteUnifiedModelParams,
  listProviders,
  listUnifiedModels,
  setDefaultModel,
  type SetDefaultModelParams,
  updateProvider,
  type UpdateProviderParams,
  updateUnifiedModel,
  type UpdateUnifiedModelParams,
} from "@/lib/ipc/providers";
import { providersKeys, unifiedModelsKeys } from "@/lib/query-keys";

interface ProvidersResult {
  /** Null while no default is set. */
  defaultModel: DefaultModel | null;
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

export function useClearDefaultModel() {
  const queryClient = useQueryClient();
  return useVoidProviderMutation({
    mutationFn: clearDefaultModel,
    networkMode: "always",
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: providersKeys.all });
    },
    retry: false,
  });
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
  return useVoidProviderMutation<DeleteProviderParams>({
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
  return useVoidProviderMutation<DeleteUnifiedModelParams>({
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

export function useProviders(): ProvidersResult {
  const query = useQuery<Providers, AppError>({
    networkMode: "always",
    queryFn: listProviders,
    queryKey: providersKeys.all,
    staleTime: Infinity,
  });
  return {
    defaultModel: query.data?.defaultModel ?? null,
    error: query.error ?? null,
    isLoading: query.isLoading,
    providers: query.data?.providers ?? [],
    retry: () => void query.refetch(),
  };
}

export function useSetDefaultModel() {
  const queryClient = useQueryClient();
  return useVoidProviderMutation<SetDefaultModelParams>({
    mutationFn: setDefaultModel,
    networkMode: "always",
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: providersKeys.all });
    },
    retry: false,
  });
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
    onSuccess: async () => {
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
    onSuccess: async () => {
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
// so the wrappers pin TError for callers branching on `error.code`. A call
// site cannot spell a bare `void` type argument (lint no-invalid-void-type),
// hence the separate wrapper for the commands that resolve null.
function useProviderMutation<TData, TVariables, TContext = unknown>(
  options: UseMutationOptions<TData, AppError, TVariables, TContext>,
): UseMutationResult<TData, AppError, TVariables, TContext> {
  return useMutation(options);
}

function useVoidProviderMutation<TVariables = void, TContext = unknown>(
  options: UseMutationOptions<void, AppError, TVariables, TContext>,
): UseMutationResult<void, AppError, TVariables, TContext> {
  return useMutation(options);
}
