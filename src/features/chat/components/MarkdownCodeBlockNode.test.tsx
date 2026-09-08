import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initI18n } from "@/lib/i18n";

import { MarkdownCodeBlockNode } from "./MarkdownCodeBlockNode";

beforeAll(initI18n);
afterEach(() => {
  cleanup();
  clearMocks();
});

describe("MarkdownCodeBlockNode", () => {
  it("renders code as text and copies the original source", async () => {
    const code =
      'const html = "<img src=x onerror=alert(1)>";\n\nconsole.log(html);\n';
    const writeText = vi.fn();
    mockIPC((command, payload) => {
      if (command === "plugin:clipboard-manager|write_text") {
        writeText(payload);
        return;
      }
      throw new Error(`Unexpected IPC command: ${command}`);
    });
    const { container } = render(
      <TooltipProvider>
        <MarkdownCodeBlockNode
          isDark
          node={{ code, language: "ts", type: "code_block" }}
        />
      </TooltipProvider>,
    );

    await waitFor(() =>
      expect(container.querySelector("code span[style]")).not.toBeNull(),
    );
    expect(container.querySelector("code")?.textContent).toBe(code);
    expect(container.querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: code }),
      ),
    );
  });
});
