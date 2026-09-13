import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Provider } from "@/types/ipc";

import { updateProvider } from "@/lib/ipc/providers";

import { BLANK_PROVIDER_DRAFT, providerToDraft } from "./draft";
import {
  type ProviderDraftController,
  useProviderDraft,
} from "./use-provider-draft";

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
    expect(result.current.isSaving).toBe(true);
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
    result.current.adoptCreated(
      {
        ...first,
        models: [{ id: "m1", reasoning: false }],
      },
      result.current.sessionStamp(),
    ),
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
    result.current.adoptCreated(
      {
        ...first,
        models: [
          { id: "m1", reasoning: false },
          { id: "m2", reasoning: false },
        ],
      },
      result.current.sessionStamp(),
    ),
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
    result.current.adoptCreated(
      {
        ...first,
        models: [
          { id: "m1", reasoning: false },
          { id: "m2", reasoning: false },
        ],
      },
      result.current.sessionStamp(),
    ),
  );
  const savedRows = result.current.modelRows;
  act(() => result.current.updateModelRows([...savedRows].reverse()));
  expect(result.current.isChanged).toBe(true);
  expect(result.current.changedCount).toBe(1);
  act(() => result.current.updateModelRows(savedRows));
  expect(result.current.changedCount).toBe(0);
});

describe("provider enabled toggle ownership", () => {
  // Every write hangs until the test resolves it: the assertions below are
  // about what a completion does to a session that a switch, a re-open or a
  // reset touched while it ran, never about operation ordering.
  let finishToggle: (saved: Provider) => void = () => {
    throw new Error("No toggle pending");
  };

  function pendToggle(): void {
    vi.mocked(updateProvider).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishToggle = resolve;
        }),
    );
  }

  async function startToggle(result: {
    current: ProviderDraftController;
  }): Promise<void> {
    act(() => result.current.toggleEnabled(first.id, false));
    await waitFor(() => expect(updateProvider).toHaveBeenCalledTimes(1));
  }

  it("mirrors a completed toggle into the session that started it", async () => {
    pendToggle();
    const { result } = editor();

    await startToggle(result);
    // A full-replace write: the baseline document plus the new flag.
    expect(vi.mocked(updateProvider)).toHaveBeenLastCalledWith(
      { id: first.id, provider: { ...providerToDraft(first), enabled: false } },
      expect.anything(),
    );
    act(() => {
      finishToggle({ ...first, enabled: false });
    });
    await waitFor(() => expect(result.current.isToggling).toBe(false));

    expect(result.current.baseline.enabled).toBe(false);
    expect(result.current.form.getValues("enabled")).toBe(false);
    expect(result.current.isChanged).toBe(false);
  });

  it("drops a toggle that lands after another provider was selected", async () => {
    pendToggle();
    const { result } = editor();

    await startToggle(result);
    act(() => result.current.select(second.id));
    act(() => {
      finishToggle({ ...first, enabled: false });
    });
    await waitFor(() => expect(result.current.isToggling).toBe(false));

    expect(result.current.target).toEqual({ id: second.id, kind: "edit" });
    expect(result.current.baseline.enabled).toBe(second.enabled);
    expect(result.current.form.getValues("enabled")).toBe(second.enabled);
    expect(result.current.isChanged).toBe(false);
    expect(result.current.changedCount).toBe(0);
  });

  it("drops a toggle that lands after the same id was opened again", async () => {
    pendToggle();
    const { result } = editor();

    await startToggle(result);
    act(() => result.current.select(second.id));
    act(() => result.current.select(first.id));
    act(() => {
      finishToggle({ ...first, enabled: false });
    });
    await waitFor(() => expect(result.current.isToggling).toBe(false));

    expect(result.current.target).toEqual({ id: first.id, kind: "edit" });
    expect(result.current.baseline.enabled).toBe(true);
    expect(result.current.form.getValues("enabled")).toBe(true);
    expect(result.current.isChanged).toBe(false);
  });

  it("drops a toggle that lands after the session was reset", async () => {
    pendToggle();
    const { result } = editor();

    await startToggle(result);
    act(() => result.current.discard());
    act(() => {
      finishToggle({ ...first, enabled: false });
    });
    await waitFor(() => expect(result.current.isToggling).toBe(false));

    expect(result.current.target).toEqual({ id: first.id, kind: "edit" });
    expect(result.current.baseline.enabled).toBe(true);
    expect(result.current.form.getValues("enabled")).toBe(true);
    expect(result.current.isChanged).toBe(false);
    expect(result.current.changedCount).toBe(0);
  });

  it("applies a toggle started after the discard that released it", async () => {
    pendToggle();
    const { result } = editor();

    act(() => result.current.form.setValue("name", "Edited"));
    act(() => result.current.discard());
    await startToggle(result);
    act(() => {
      finishToggle({ ...first, enabled: false });
    });
    await waitFor(() => expect(result.current.isToggling).toBe(false));

    expect(result.current.baseline.enabled).toBe(false);
    expect(result.current.form.getValues("enabled")).toBe(false);
    expect(result.current.isChanged).toBe(false);
  });

  it("stamps the session: typing keeps it, a switch or a reset starts a new one", () => {
    const { result } = editor();
    const opened = result.current.sessionStamp();

    act(() => result.current.form.setValue("name", "Typed"));
    expect(result.current.sessionStamp()).toBe(opened);

    act(() => result.current.select(second.id));
    const switched = result.current.sessionStamp();
    expect(switched).not.toBe(opened);

    act(() => result.current.select(first.id));
    const reopened = result.current.sessionStamp();
    expect(reopened).not.toBe(switched);

    act(() => result.current.discard());
    expect(result.current.sessionStamp()).not.toBe(reopened);
  });
});

describe("created provider adoption", () => {
  const created: Provider = { ...first, id: "p9", name: "Created" };

  it("opens a created provider in the session its write started in", () => {
    const { result } = editor();
    const stamp = result.current.sessionStamp();

    act(() => result.current.adoptCreated(created, stamp));

    expect(result.current.target).toEqual({ id: "p9", kind: "edit" });
    expect(result.current.form.getValues("name")).toBe("Created");
    expect(result.current.isChanged).toBe(false);
  });

  it("drops a create whose stamp a switch, a re-open or a reset invalidated", () => {
    const { result } = editor();
    const stamp = result.current.sessionStamp();

    act(() => result.current.select(second.id));
    act(() => result.current.adoptCreated(created, stamp));
    expect(result.current.target).toEqual({ id: second.id, kind: "edit" });

    // Away and back: the id is the same, the session is not.
    act(() => result.current.select(first.id));
    act(() => result.current.adoptCreated(created, stamp));
    expect(result.current.target).toEqual({ id: first.id, kind: "edit" });

    const reopened = result.current.sessionStamp();
    act(() => result.current.discard());
    act(() => result.current.adoptCreated(created, reopened));
    expect(result.current.target).toEqual({ id: first.id, kind: "edit" });
    expect(result.current.form.getValues("name")).toBe("First");
  });

  it("keeps an edited session over a create that lands in it", () => {
    const { result } = editor();
    const stamp = result.current.sessionStamp();
    act(() => result.current.form.setValue("name", "Typed"));

    act(() => result.current.adoptCreated(created, stamp));

    expect(result.current.target).toEqual({ id: first.id, kind: "edit" });
    expect(result.current.form.getValues("name")).toBe("Typed");
  });
});
