import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/types/ipc";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";

import { Composer } from "./Composer";

const DB_ERROR: AppError = { code: "db", message: "append failed" };

function renderComposer(
  error: AppError | null = null,
  disabled = false,
  onSend: (text: string) => void = () => undefined,
) {
  const onTextChange = vi.fn<(text: string) => void>();
  render(
    <TooltipProvider>
      <Composer
        disabled={disabled}
        error={error}
        onSend={onSend}
        onTextChange={onTextChange}
        value="你好"
      />
    </TooltipProvider>,
  );
  return { input: screen.getByRole("textbox"), onSend, onTextChange };
}

beforeAll(initI18n);
afterEach(cleanup);

describe("Composer", () => {
  it.each([
    { isComposing: true, keyCode: 13 },
    { isComposing: false, keyCode: 229 },
  ])("keeps an IME confirmation in the editor (%j)", (nativeEvent) => {
    const onSend = vi.fn<(text: string) => void>();
    const { input } = renderComposer(null, false, onSend);

    expect(fireEvent.keyDown(input, { key: "Enter", ...nativeEvent })).toBe(
      true,
    );
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveProperty("value", "你好");

    fireEvent.keyDown(input, { isComposing: false, key: "Enter", keyCode: 13 });
    expect(onSend).toHaveBeenCalledExactlyOnceWith("你好");
    // The draft clears only after the write is confirmed persisted.
    expect(input).toHaveProperty("value", "你好");
  });

  it("keeps Shift+Enter available for a newline", () => {
    const onSend = vi.fn<(text: string) => void>();
    const { input } = renderComposer(null, false, onSend);
    expect(fireEvent.keyDown(input, { key: "Enter", shiftKey: true })).toBe(
      true,
    );
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveProperty("value", "你好");
  });

  it("routes edits through onTextChange (controlled input)", () => {
    const { input, onTextChange } = renderComposer();
    fireEvent.change(input, { target: { value: "edited" } });
    expect(onTextChange).toHaveBeenCalledExactlyOnceWith("edited");
  });

  it("blocks submission while the target write is pending", () => {
    const onSend = vi.fn<(text: string) => void>();
    const { input } = renderComposer(null, true, onSend);
    expect(input).toHaveProperty("disabled", true);
    // A disabled textarea fires no keydown at all; the platform guard
    // precedes the handler.
    expect(fireEvent.keyDown(input, { isComposing: false, key: "Enter" })).toBe(
      false,
    );
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sending…" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows the submit failure without dropping the input", () => {
    const { input } = renderComposer(DB_ERROR);
    expect(screen.getByRole("alert").textContent).toBe("Database error");
    expect(input).toHaveProperty("value", "你好");
    expect(input).toHaveProperty("disabled", false);
  });
});
