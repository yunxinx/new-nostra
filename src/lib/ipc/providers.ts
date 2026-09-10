import { invoke } from "@tauri-apps/api/core";

import type {
  ModelEntry,
  Protocol,
  Provider,
  ProviderDraft,
  ProviderPreset,
  Providers,
  ResolvedCompat,
  UnifiedModel,
  UnifiedModelDraft,
  UnifiedModelListItem,
} from "@/types/ipc";

/** create_provider request: the full draft to store; it carries no id. */
export interface CreateProviderParams {
  provider: ProviderDraft;
}

/** create_unified_model request: the aggregate to store, members in attempt order. */
export interface CreateUnifiedModelParams {
  unified: UnifiedModelDraft;
}

/** delete_provider request: removes the provider, its models and pinned members. */
export interface DeleteProviderParams {
  id: string;
}

/** delete_unified_model request: removes the aggregate; its members go with it. */
export interface DeleteUnifiedModelParams {
  id: string;
}

/** resolve_compat request: an absent model asks for the provider-level view. */
export interface ResolveCompatParams {
  model?: ModelEntry;
  protocol: Protocol;
  provider: ProviderDraft;
}

/** set_default_model request: the model reference to promote to default. */
export interface SetDefaultModelParams {
  modelId: string;
  providerId: string;
}

/**
 * update_provider request: `id` locates the row, the draft replaces it
 * wholesale.
 */
export interface UpdateProviderParams {
  id: string;
  provider: ProviderDraft;
}

/**
 * update_unified_model request: a draft id that differs from the path id is a
 * rename.
 */
export interface UpdateUnifiedModelParams {
  id: string;
  unified: UnifiedModelDraft;
}

/**
 * Clears the default-model reference; succeeds even when none is set. Rejects
 * with AppError only on database failure.
 */
export function clearDefaultModel(): Promise<void> {
  return invoke("clear_default_model");
}

/**
 * Creates a provider from a full draft and returns the stored row. Rejects with
 * AppError when validation fails (blank or duplicate name, base-url rules,
 * alias constraints) or the database write fails.
 */
export function createProvider(
  params: CreateProviderParams,
): Promise<Provider> {
  return invoke("create_provider", { params });
}

/**
 * Creates a unified model from a draft; members must pin registered models and
 * stay in attempt order. Rejects with AppError on validation failure (blank
 * name, empty or duplicate members, name collision with an unhidden model or
 * alias).
 */
export function createUnifiedModel(
  params: CreateUnifiedModelParams,
): Promise<UnifiedModel> {
  return invoke("create_unified_model", { params });
}

/**
 * Deletes the provider with its models and any unified-model members pinned to
 * them; default-model and empty-aggregate cleanup happens in the same
 * transaction. Rejects with AppError when the id is missing.
 */
export function deleteProvider(params: DeleteProviderParams): Promise<void> {
  return invoke("delete_provider", { params });
}

/**
 * Deletes the unified model; its member rows go with it. Rejects with AppError
 * when the id is missing.
 */
export function deleteUnifiedModel(
  params: DeleteUnifiedModelParams,
): Promise<void> {
  return invoke("delete_unified_model", { params });
}

/**
 * Lists the built-in vendor presets for prefilling the create form; no preset
 * carries an API key. Rejects with AppError only on internal failure.
 */
export function listProviderPresets(): Promise<ProviderPreset[]> {
  return invoke("list_provider_presets");
}

/**
 * Lists every stored provider in creation order plus the default-model
 * reference; a corrupted row arrives as a `ProviderListItem` placeholder.
 * Rejects with AppError on database failure.
 */
export function listProviders(): Promise<Providers> {
  return invoke("list_providers");
}

/**
 * Lists every unified model in creation order; a corrupted aggregate arrives as
 * a `UnifiedModelListItem` placeholder. Rejects with AppError on database
 * failure.
 */
export function listUnifiedModels(): Promise<UnifiedModelListItem[]> {
  return invoke("list_unified_models");
}

/**
 * Resolves one protocol's effective compat for the submitted form draft,
 * reading no stored state; `sources` covers exactly the keys of `values`. No
 * draft field is rejected — the panel shows values for whatever the form
 * currently holds.
 */
export function resolveCompat(
  params: ResolveCompatParams,
): Promise<ResolvedCompat> {
  return invoke("resolve_compat", { params });
}

/**
 * Stores one model as the single default; the model must exist and its `apis`
 * set must be non-empty. Rejects with AppError on a missing provider or model,
 * or an empty `apis`.
 */
export function setDefaultModel(params: SetDefaultModelParams): Promise<void> {
  return invoke("set_default_model", { params });
}

/**
 * Replaces the stored provider wholesale under `id`. Rejects with AppError when
 * the id is missing or validation fails; the stored row stays unchanged.
 */
export function updateProvider(
  params: UpdateProviderParams,
): Promise<Provider> {
  return invoke("update_provider", { params });
}

/**
 * Replaces the unified model under `id` wholesale; a draft id that differs is a
 * rename. Rejects with AppError when the id is missing or validation fails.
 */
export function updateUnifiedModel(
  params: UpdateUnifiedModelParams,
): Promise<UnifiedModel> {
  return invoke("update_unified_model", { params });
}
