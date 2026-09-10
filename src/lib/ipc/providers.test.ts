import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AppError,
  ModelEntry,
  Provider,
  ProviderDraft,
  Providers,
  ResolvedCompat,
  UnifiedModel,
} from "@/types/ipc";

import {
  clearDefaultModel,
  createProvider,
  createUnifiedModel,
  deleteProvider,
  deleteUnifiedModel,
  listProviderPresets,
  listProviders,
  listUnifiedModels,
  resolveCompat,
  setDefaultModel,
  updateProvider,
  updateUnifiedModel,
} from "./providers";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

const PROVIDER_DRAFT: ProviderDraft = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "",
  baseUrl: "http://localhost:11434/v1",
  enabled: true,
  maxRetries: 2,
  name: "Ollama",
  reasoningOutput: "auto",
  requestTimeoutMs: 120000,
  streamIdleTimeoutMs: 120000,
};

const STORED_PROVIDER: Provider = {
  ...PROVIDER_DRAFT,
  id: "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0001",
};

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("providers IPC wrappers", () => {
  it("listProviders forwards the command name with no params object", async () => {
    const payload: Providers = { defaultModel: null, providers: [] };
    mockInvoke.mockResolvedValue(payload);
    await expect(listProviders()).resolves.toEqual(payload);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("list_providers");
  });

  it("listProviderPresets and listUnifiedModels stay param-free", async () => {
    mockInvoke.mockResolvedValue([]);
    await listProviderPresets();
    await listUnifiedModels();
    expect(mockInvoke).toHaveBeenNthCalledWith(1, "list_provider_presets");
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "list_unified_models");
  });

  it("clearDefaultModel invokes with no params object", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await clearDefaultModel();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("clear_default_model");
  });

  it("createProvider sends the full draft under params", async () => {
    mockInvoke.mockResolvedValue(STORED_PROVIDER);
    await expect(createProvider({ provider: PROVIDER_DRAFT })).resolves.toEqual(
      STORED_PROVIDER,
    );
    expect(mockInvoke).toHaveBeenCalledWith("create_provider", {
      params: { provider: PROVIDER_DRAFT },
    });
  });

  it("updateProvider carries the path id and the replacement draft", async () => {
    mockInvoke.mockResolvedValue(STORED_PROVIDER);
    await expect(
      updateProvider({ id: STORED_PROVIDER.id, provider: PROVIDER_DRAFT }),
    ).resolves.toEqual(STORED_PROVIDER);
    expect(mockInvoke).toHaveBeenCalledWith("update_provider", {
      params: { id: STORED_PROVIDER.id, provider: PROVIDER_DRAFT },
    });
  });

  it("setDefaultModel sends camelCase provider and model ids", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await setDefaultModel({ modelId: "deepseek-flash", providerId: "p1" });
    expect(mockInvoke).toHaveBeenCalledWith("set_default_model", {
      params: { modelId: "deepseek-flash", providerId: "p1" },
    });
  });

  it("resolveCompat omits an absent model and pins the protocol", async () => {
    const resolved: ResolvedCompat = {
      sources: { supportsStore: "familyDefault" },
      values: { supportsStore: true },
    };
    mockInvoke.mockResolvedValue(resolved);
    await expect(
      resolveCompat({
        protocol: "openai-completions",
        provider: PROVIDER_DRAFT,
      }),
    ).resolves.toEqual(resolved);
    expect(mockInvoke).toHaveBeenCalledWith("resolve_compat", {
      params: { protocol: "openai-completions", provider: PROVIDER_DRAFT },
    });

    const model: ModelEntry = {
      apis: ["openai-completions"],
      id: "deepseek-flash",
      reasoning: true,
    };
    mockInvoke.mockResolvedValue(resolved);
    await resolveCompat({
      model,
      protocol: "openai-completions",
      provider: PROVIDER_DRAFT,
    });
    expect(mockInvoke).toHaveBeenLastCalledWith("resolve_compat", {
      params: {
        model,
        protocol: "openai-completions",
        provider: PROVIDER_DRAFT,
      },
    });
  });

  it("create and update unified model send the draft under params", async () => {
    const unified: UnifiedModel = {
      hide: false,
      id: "fast",
      members: [{ model: "deepseek-flash", providerId: "p1" }],
    };
    mockInvoke.mockResolvedValue(unified);
    await expect(createUnifiedModel({ unified })).resolves.toEqual(unified);
    await expect(updateUnifiedModel({ id: "fast", unified })).resolves.toEqual(
      unified,
    );
    expect(mockInvoke).toHaveBeenNthCalledWith(1, "create_unified_model", {
      params: { unified },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "update_unified_model", {
      params: { id: "fast", unified },
    });
  });

  it("deleteProvider and deleteUnifiedModel forward only the id", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await deleteProvider({ id: "p1" });
    await deleteUnifiedModel({ id: "fast" });
    expect(mockInvoke).toHaveBeenNthCalledWith(1, "delete_provider", {
      params: { id: "p1" },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "delete_unified_model", {
      params: { id: "fast" },
    });
  });

  it("surfaces the serialized AppError rejection", async () => {
    const failure: AppError = {
      code: "invalid_input",
      message: "alias conflict",
    };
    mockInvoke.mockRejectedValue(failure);
    await expect(
      createUnifiedModel({ unified: { hide: false, id: "fast" } }),
    ).rejects.toEqual(failure);
  });
});
