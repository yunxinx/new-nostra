import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";

import { resolveSettingsClose, setWindowBackground } from "./windows";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

it.each([true, false])(
  "forwards the close decision accepted=%s",
  async (accepted) => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await resolveSettingsClose(accepted);
    expect(invoke).toHaveBeenCalledWith("resolve_settings_close", {
      params: { accepted },
    });
  },
);

it("preserves a native close failure for the settings error surface", async () => {
  const error = { code: "internal", message: "native window action failed" };
  vi.mocked(invoke).mockRejectedValue(error);
  await expect(resolveSettingsClose(true)).rejects.toBe(error);
});

it.each(["#22272e", "#ffffff"])(
  "sends the explicit color %s through the owned command contract",
  async (color) => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await setWindowBackground(color);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("set_window_background", {
      params: { color },
    });
  },
);

it("preserves a native background failure for the startup fallback", async () => {
  const error = {
    code: "internal",
    message: "native background update failed",
  };
  vi.mocked(invoke).mockRejectedValue(error);
  await expect(setWindowBackground("#22272e")).rejects.toBe(error);
});
