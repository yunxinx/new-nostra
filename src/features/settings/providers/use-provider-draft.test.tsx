import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Provider } from "@/types/ipc";

import { updateProvider } from "@/lib/ipc/providers";

import { BLANK_PROVIDER_DRAFT } from "./draft";
import { useProviderDraft } from "./use-provider-draft";

vi.mock("@/lib/ipc/providers", () => ({ updateProvider: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const first: Provider = {
  ...BLANK_PROVIDER_DRAFT,
  baseUrl: "https://example.com",
  id: "p1",
  name: "First",
};
const second: Provider = { ...first, id: "p2", name: "Second" };

function editor() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const hook = renderHook(() => useProviderDraft([first, second]), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  act(() => hook.result.current.select(first.id));
  return hook;
}

describe("provider save ownership", () => {
  it("keeps edits made after submission and advances their baseline", async () => {
    let complete: (saved: Provider) => void = () => {
      throw new Error("No save pending");
    };
    vi.mocked(updateProvider).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { result } = editor();
    act(() => result.current.form.setValue("name", "Submitted"));
    act(() => result.current.save());
    await waitFor(() => expect(updateProvider).toHaveBeenCalledTimes(1));
    act(() => result.current.form.setValue("name", "Still typing"));
    act(() => {
      complete({ ...first, name: "Submitted" });
    });
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(result.current.form.getValues("name")).toBe("Still typing");
    expect(result.current.isChanged).toBe(true);
    act(() => result.current.discard());
    expect(result.current.form.getValues("name")).toBe("Submitted");
  });

  it("does not reopen a provider after a different provider is selected", async () => {
    let complete: (saved: Provider) => void = () => {
      throw new Error("No save pending");
    };
    vi.mocked(updateProvider).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { result } = editor();
    act(() => result.current.form.setValue("name", "Submitted"));
    act(() => result.current.save());
    await waitFor(() => expect(updateProvider).toHaveBeenCalledTimes(1));
    act(() => result.current.select(second.id));
    act(() => {
      complete({ ...first, name: "Submitted" });
    });
    expect(result.current.target).toEqual({ id: second.id, kind: "edit" });
    expect(result.current.form.getValues("name")).toBe("Second");
  });
});

it("counts individual model and compatibility fields and clears a restored override", () => {
  const { result } = editor();
  act(() =>
    result.current.adoptCreated({
      ...first,
      models: [{ id: "m1", reasoning: false }],
    }),
  );
  act(() =>
    result.current.updateModelRows(
      result.current.modelRows.map((row) => ({
        ...row,
        model: { ...row.model, name: "New name", reasoning: true },
      })),
    ),
  );
  act(() =>
    result.current.form.setValue("compat", {
      "openai-completions": {
        supportsDeveloperRole: false,
        supportsStore: true,
      },
    }),
  );
  expect(result.current.changedCount).toBe(4);
  act(() => result.current.discard());
  act(() => result.current.form.setValue("compat", null));
  expect(result.current.isChanged).toBe(false);
  expect(result.current.changedCount).toBe(0);
});

it("clears model changes and keeps row identity when the directory is restored", () => {
  const { result } = editor();
  act(() =>
    result.current.adoptCreated({
      ...first,
      models: [
        { id: "m1", reasoning: false },
        { id: "m2", reasoning: false },
      ],
    }),
  );
  const savedKeys = result.current.modelRows.map((row) => row.key);
  act(() => result.current.updateModelRows(result.current.modelRows.slice(1)));
  expect(result.current.changedCount).toBe(1);
  act(() => result.current.revertField("models"));
  expect(result.current.models).toEqual([
    { id: "m1", reasoning: false },
    { id: "m2", reasoning: false },
  ]);
  expect(result.current.isChanged).toBe(false);
  expect(result.current.changedCount).toBe(0);
  expect(result.current.modelRows.map((row) => row.key)).toEqual(savedKeys);
});

it("counts a change in model order and clears it when the order is restored", () => {
  const { result } = editor();
  act(() =>
    result.current.adoptCreated({
      ...first,
      models: [
        { id: "m1", reasoning: false },
        { id: "m2", reasoning: false },
      ],
    }),
  );
  const savedRows = result.current.modelRows;
  act(() => result.current.updateModelRows([...savedRows].reverse()));
  expect(result.current.isChanged).toBe(true);
  expect(result.current.changedCount).toBe(1);
  act(() => result.current.updateModelRows(savedRows));
  expect(result.current.changedCount).toBe(0);
});
