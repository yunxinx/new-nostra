import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";

import { Composer } from "./Composer";

beforeAll(initI18n);
afterEach(cleanup);

describe("Composer", () => {
  it.each([
    { isComposing: true, keyCode: 13 },
    { isComposing: false, keyCode: 229 },
  ])("keeps an IME confirmation in the editor (%j)", (nativeEvent) => {
    const onSend = vi.fn<(text: string) => void>();
    render(
      <TooltipProvider>
        <Composer onSend={onSend} />
      </TooltipProvider>,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "你好" } });

    expect(fireEvent.keyDown(input, { key: "Enter", ...nativeEvent })).toBe(
      true,
    );
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveProperty("value", "你好");

    fireEvent.keyDown(input, { isComposing: false, key: "Enter", keyCode: 13 });
    expect(onSend).toHaveBeenCalledExactlyOnceWith("你好");
    expect(input).toHaveProperty("value", "");
  });

  it("keeps Shift+Enter available for a newline", () => {
    const onSend = vi.fn<(text: string) => void>();
    render(
      <TooltipProvider>
        <Composer onSend={onSend} />
      </TooltipProvider>,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "draft" } });
    expect(fireEvent.keyDown(input, { key: "Enter", shiftKey: true })).toBe(
      true,
    );
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveProperty("value", "draft");
  });
});
