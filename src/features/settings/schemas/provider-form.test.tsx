import type { FieldErrors } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ProviderDraft } from "@/types/ipc";

import { providerDraftSchema } from "./provider";

// Minimal react-hook-form wiring over the real draft schema: a trimmed field
// surface that still exercises the three shapes the settings subpages rely on —
// hyphenated compat keys and a protocol checkbox set
// input. The useForm generics are part of the check: a mirror-shaped draft must
// be accepted as form values, and the resolver must hand back parsed drafts.

type DraftFormValues = z.input<typeof providerDraftSchema>;
type DraftSubmission = z.output<typeof providerDraftSchema>;

const DRAFT: ProviderDraft = {
  abortOnDisconnect: true,
  api: "openai-completions",
  apiKey: "",
  baseUrl: "https://gateway.example/v1",
  compat: { "openai-completions": { supportsStore: false } },
  enabled: true,
  maxRetries: 2,
  models: [{ apis: [], id: "deepseek-chat", reasoning: true }],
  name: "Gateway",
  reasoningOutput: "auto",
  requestTimeoutMs: 120000,
  streamIdleTimeoutMs: 120000,
};

interface DraftFormProps {
  onInvalid: (errors: FieldErrors<DraftFormValues>) => void;
  onValid: (draft: DraftSubmission) => void;
}

function DraftForm({ onInvalid, onValid }: DraftFormProps) {
  const { handleSubmit, register } = useForm<
    DraftFormValues,
    unknown,
    DraftSubmission
  >({
    defaultValues: DRAFT,
    resolver: zodResolver(providerDraftSchema),
  });

  return (
    <form
      onSubmit={(event) => {
        // RHF's submit handler is async; the void marker keeps the DOM
        // handler's void contract.
        void handleSubmit(onValid, onInvalid)(event);
      }}
    >
      <label>
        supportsStore
        <input
          type="checkbox"
          {...register("compat.openai-completions.supportsStore")}
        />
      </label>
      <label>
        maxTokensField
        <select {...register("compat.openai-completions.maxTokensField")}>
          <option value="">unset</option>
          <option value="max_tokens">max_tokens</option>
          <option value="max_completion_tokens">max_completion_tokens</option>
        </select>
      </label>
      <label>
        protocol openai-completions
        <input
          type="checkbox"
          value="openai-completions"
          {...register("models.0.apis")}
        />
      </label>
      <label>
        protocol anthropic-messages
        <input
          type="checkbox"
          value="anthropic-messages"
          {...register("models.0.apis")}
        />
      </label>
      <button type="submit">Save</button>
    </form>
  );
}

function renderDraftForm() {
  const onInvalid = vi.fn<(errors: FieldErrors<DraftFormValues>) => void>();
  const onValid = vi.fn<(draft: DraftSubmission) => void>();
  render(<DraftForm onInvalid={onInvalid} onValid={onValid} />);
  return { onInvalid, onValid };
}

async function submitInvalid(
  change: () => void,
): Promise<FieldErrors<DraftFormValues>> {
  const { onInvalid, onValid } = renderDraftForm();
  change();
  fireEvent.submit(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => {
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });
  expect(onValid).not.toHaveBeenCalled();
  const errors = onInvalid.mock.calls[0]?.[0];
  expect(errors).toBeDefined();
  return errors ?? {};
}

afterEach(cleanup);

describe("provider draft form", () => {
  it("submits parsed values for hyphenated compat keys and protocol boxes", async () => {
    const { onInvalid, onValid } = renderDraftForm();

    fireEvent.click(screen.getByRole("checkbox", { name: "supportsStore" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "protocol openai-completions" }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "maxTokensField" }), {
      target: { value: "max_tokens" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onValid).toHaveBeenCalledTimes(1);
    });
    expect(onInvalid).not.toHaveBeenCalled();

    const draft = onValid.mock.calls[0]?.[0];
    // The hyphenated register path nests under the family key; it never splits
    // into `openai: { completions: ... }`.
    expect(draft?.compat?.["openai-completions"]).toEqual({
      maxTokensField: "max_tokens",
      supportsStore: true,
    });
    expect(draft?.models?.[0]?.apis).toEqual(["openai-completions"]);
  });

  it("rejects an unset enum select at its hyphenated compat path", async () => {
    const errors = await submitInvalid(() => undefined);

    expect(
      errors.compat?.["openai-completions"]?.maxTokensField?.message,
    ).toBeTypeOf("string");
  });
});
