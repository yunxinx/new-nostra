import { beforeEach, describe, expect, it } from "vitest";

import { useUiStore } from "./ui-store";

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.setState({
      activeSessionId: null,
      draftId: 0,
      sidebarCollapsed: false,
      sidebarWidth: 272,
      themeOverride: "system",
    });
  });

  it("setSidebarCollapsed updates the collapsed slice", () => {
    useUiStore.getState().setSidebarCollapsed(true);
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);

    useUiStore.getState().setSidebarCollapsed(false);
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });

  it("toggleSidebarCollapsed flips the collapsed slice", () => {
    useUiStore.getState().toggleSidebarCollapsed();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);

    useUiStore.getState().toggleSidebarCollapsed();
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });

  it("setSidebarWidth clamps to the 220..440 range", () => {
    useUiStore.getState().setSidebarWidth(120);
    expect(useUiStore.getState().sidebarWidth).toBe(220);

    useUiStore.getState().setSidebarWidth(600);
    expect(useUiStore.getState().sidebarWidth).toBe(440);

    useUiStore.getState().setSidebarWidth(300);
    expect(useUiStore.getState().sidebarWidth).toBe(300);
  });

  it("setActiveSession updates the active session id", () => {
    useUiStore.getState().setActiveSession("session-1");
    expect(useUiStore.getState().activeSessionId).toBe("session-1");

    useUiStore.getState().setActiveSession(null);
    expect(useUiStore.getState().activeSessionId).toBeNull();
  });

  it("setThemeOverride updates the override slice", () => {
    useUiStore.getState().setThemeOverride("dark");
    expect(useUiStore.getState().themeOverride).toBe("dark");
  });

  it("starts a fresh draft from a selected session or an existing draft", () => {
    const store = useUiStore.getState();
    store.setActiveSession("session-1");
    store.setSidebarWidth(320);
    store.setThemeOverride("dark");

    store.startNewChat();
    const firstDraft = useUiStore.getState();
    expect(firstDraft.activeSessionId).toBeNull();
    expect(firstDraft.draftId).not.toBe(store.draftId);

    firstDraft.startNewChat();
    const secondDraft = useUiStore.getState();
    expect(secondDraft.activeSessionId).toBeNull();
    expect(secondDraft.draftId).not.toBe(firstDraft.draftId);
    expect(secondDraft.sidebarWidth).toBe(320);
    expect(secondDraft.themeOverride).toBe("dark");
  });

  it("replaces state immutably on updates (immer middleware)", () => {
    const before = useUiStore.getState();
    useUiStore.getState().setSidebarCollapsed(true);
    const after = useUiStore.getState();

    expect(after.sidebarCollapsed).toBe(true);
    expect(after).not.toBe(before);
  });

  it("keeps action identity stable across state updates", () => {
    const actionBefore = useUiStore.getState().setSidebarCollapsed;
    useUiStore.getState().setSidebarCollapsed(true);
    expect(useUiStore.getState().setSidebarCollapsed).toBe(actionBefore);
  });
});
