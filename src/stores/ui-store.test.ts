import { beforeEach, describe, expect, it } from "vitest";

import { useUiStore } from "./ui-store";

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.setState({ sidebarOpen: true });
  });

  it("setSidebarOpen updates the sidebarOpen slice", () => {
    useUiStore.getState().setSidebarOpen(false);
    expect(useUiStore.getState().sidebarOpen).toBe(false);

    useUiStore.getState().setSidebarOpen(true);
    expect(useUiStore.getState().sidebarOpen).toBe(true);
  });

  it("replaces state immutably on updates (immer middleware)", () => {
    const before = useUiStore.getState();
    useUiStore.getState().setSidebarOpen(false);
    const after = useUiStore.getState();

    expect(after.sidebarOpen).toBe(false);
    expect(after).not.toBe(before);
  });

  it("keeps action identity stable across state updates", () => {
    const actionBefore = useUiStore.getState().setSidebarOpen;
    useUiStore.getState().setSidebarOpen(false);
    expect(useUiStore.getState().setSidebarOpen).toBe(actionBefore);
  });
});
