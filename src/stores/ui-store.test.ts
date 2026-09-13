import { beforeEach, describe, expect, it } from "vitest";

import { draftKeyFor, useUiStore } from "./ui-store";

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.setState({
      activeSessionId: null,
      draftErrors: new Map(),
      draftId: 0,
      drafts: new Map(),
      modelByDraft: new Map(),
      pendingDeletes: new Set(),
      pendingSubmits: new Set(),
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

  it("moves a model selection to the created session without changing the active view", () => {
    const store = useUiStore.getState();
    const model = { kind: "unified", modelId: "fast" } as const;
    store.setModel("draft:0", model);
    store.setActiveSession("another-session");
    store.transferDraftModel("draft:0", "created-session");
    expect(useUiStore.getState().modelByDraft.get("created-session")).toEqual(
      model,
    );
    expect(useUiStore.getState().modelByDraft.has("draft:0")).toBe(false);
    expect(useUiStore.getState().activeSessionId).toBe("another-session");
  });

  it("keeps a newer session selection and does not resurrect revoked drafts", () => {
    const store = useUiStore.getState();
    store.setModel("draft:0", { kind: "unified", modelId: "old" });
    store.setModel("created-session", { kind: "unified", modelId: "new" });
    store.transferDraftModel("draft:0", "created-session");
    expect(
      useUiStore.getState().modelByDraft.get("created-session")?.modelId,
    ).toBe("new");
    expect(useUiStore.getState().modelByDraft.has("draft:0")).toBe(false);

    store.setModel("draft:0", { kind: "unified", modelId: "revoked" });
    store.startNewChat();
    store.transferDraftModel("draft:0", "late-session");
    expect(useUiStore.getState().modelByDraft.has("late-session")).toBe(false);
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

  it("revokes the previous anonymous draft and its error on startNewChat", () => {
    const store = useUiStore.getState();
    const key = draftKeyFor(store.draftId);
    store.setDraft(key, "typed");
    store.setDraftError(key, { code: "db", message: "failed" });

    store.startNewChat();
    const next = useUiStore.getState();
    expect(next.drafts.get(key)).toBeUndefined();
    expect(next.draftErrors.get(key)).toBeUndefined();
    // A submit still in flight for the revoked draft cannot resurrect either.
    expect(next.draftId).toBe(store.draftId + 1);
  });

  it("resolves a submit by clearing only the submitted draft version", () => {
    const store = useUiStore.getState();
    store.setDraft("s1", "submitted");
    store.setDraftError("s1", { code: "db", message: "failed" });

    store.resolveSubmit("s1", "submitted");
    expect(useUiStore.getState().drafts.get("s1")).toBeUndefined();
    expect(useUiStore.getState().draftErrors.get("s1")).toBeUndefined();

    store.setDraft("s1", "typed later");
    store.resolveSubmit("s1", "submitted");
    expect(useUiStore.getState().drafts.get("s1")).toBe("typed later");
  });

  it("clears a draft whose padded form matches the submitted version", () => {
    const store = useUiStore.getState();
    // The composer submits the trimmed form; the retained draft keeps the
    // raw input, so the version compare is whitespace-insensitive.
    store.setDraft("s1", "hello  ");
    store.resolveSubmit("s1", "hello");
    expect(useUiStore.getState().drafts.get("s1")).toBeUndefined();
  });

  it("discards a draft and its error unconditionally", () => {
    const store = useUiStore.getState();
    store.setDraft("s1", "typed");
    store.setDraftError("s1", { code: "db", message: "failed" });

    store.discardDraft("s1");
    expect(useUiStore.getState().drafts.get("s1")).toBeUndefined();
    expect(useUiStore.getState().draftErrors.get("s1")).toBeUndefined();
  });

  it("tracks pending submits and deletes as reversible flags", () => {
    const store = useUiStore.getState();
    store.beginSubmit("draft:1");
    store.beginDelete("s1");
    expect(useUiStore.getState().pendingSubmits.has("draft:1")).toBe(true);
    expect(useUiStore.getState().pendingDeletes.has("s1")).toBe(true);

    store.endSubmit("draft:1");
    store.endDelete("s1");
    expect(useUiStore.getState().pendingSubmits.has("draft:1")).toBe(false);
    expect(useUiStore.getState().pendingDeletes.has("s1")).toBe(false);
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
