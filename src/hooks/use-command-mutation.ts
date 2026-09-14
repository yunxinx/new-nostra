import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";

import type { AppError } from "@/types/ipc";

/**
 * A Rust command that resolves nothing and rejects with the serialized
 * AppError. A call site cannot spell a bare void type argument (lint
 * no-invalid-void-type), so every command mutation spells its generics here.
 */
export function useCommandMutation<TVariables, TContext = unknown>(
  options: UseMutationOptions<void, AppError, TVariables, TContext>,
): UseMutationResult<void, AppError, TVariables, TContext> {
  return useMutation(options);
}
