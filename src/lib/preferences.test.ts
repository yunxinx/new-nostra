import i18next from "i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { getPreference } from "@/lib/ipc/preferences";
import { useUiStore } from "@/stores/ui-store";

import {
  hydrateSharedPreferences,
  hydrateSidebarGeometry,
} from "./preferences";

vi.mock("@/lib/ipc/preferences", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/ipc/preferences")>();
  return { ...original, getPreference: vi.fn() };
});

beforeEach(() => {
  useUiStore.setState(useUiStore.getInitialState(), true);
  vi.mocked(getPreference).mockReset();
});
afterEach(() => vi.restoreAllMocks());

it("requests shared preferences together and restores both before resolving", async () => {
  const reads = new Map<string, (value: unknown) => void>();
  vi.mocked(getPreference).mockImplementation(
    (key) => new Promise((resolve) => reads.set(key, resolve)),
  );
  const changeLanguage = vi
    .spyOn(i18next, "changeLanguage")
    .mockResolvedValue(i18next.t);
  const hydration = hydrateSharedPreferences();
  expect([...reads.keys()]).toEqual(["themeOverride", "language"]);
  reads.get("themeOverride")?.("light");
  reads.get("language")?.("zh");
  await hydration;
  expect(useUiStore.getState().themeOverride).toBe("light");
  expect(changeLanguage).toHaveBeenCalledWith("zh");
});

it("loads valid preferences even if a neighboring read fails", async () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(getPreference).mockImplementation((key) =>
    key === "themeOverride"
      ? Promise.resolve("dark")
      : Promise.reject(new Error("Store read failed")),
  );
  await hydrateSharedPreferences();
  expect(useUiStore.getState().themeOverride).toBe("dark");
  expect(report).toHaveBeenCalledOnce();
});

it("hydrates independent geometry keys with the existing width clamp", async () => {
  const reads = new Map<string, (value: unknown) => void>();
  vi.mocked(getPreference).mockImplementation(
    (key) => new Promise((resolve) => reads.set(key, resolve)),
  );
  const hydration = hydrateSidebarGeometry();
  expect([...reads.keys()]).toEqual(["sidebarWidth", "sidebarCollapsed"]);
  reads.get("sidebarWidth")?.(999);
  reads.get("sidebarCollapsed")?.(true);
  await hydration;
  expect(useUiStore.getState().sidebarWidth).toBe(440);
  expect(useUiStore.getState().sidebarCollapsed).toBe(true);
});

it("keeps defaults for invalid persisted values", async () => {
  const changeLanguage = vi
    .spyOn(i18next, "changeLanguage")
    .mockResolvedValue(i18next.t);
  vi.mocked(getPreference).mockResolvedValue({ unexpected: true });
  await Promise.all([hydrateSharedPreferences(), hydrateSidebarGeometry()]);
  expect(changeLanguage).not.toHaveBeenCalled();
  expect(useUiStore.getState().themeOverride).toBe("system");
  expect(useUiStore.getState().sidebarWidth).toBe(
    useUiStore.getInitialState().sidebarWidth,
  );
});
