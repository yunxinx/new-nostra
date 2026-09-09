import { enableMapSet } from "immer";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { AppError } from "@/types/ipc";

// Map/Set drafts need the immer plugin; the call is idempotent.
enableMapSet();

export type ThemeOverride = "dark" | "light" | "system";

const SIDEBAR_MAX_WIDTH = 440;
const SIDEBAR_MIN_WIDTH = 220;

interface UiState {
  activeSessionId: null | string;
  /** Sessions with an in-flight delete; blocks sends for the same session. */
  beginDelete: (sessionId: string) => void;
  /** Draft locations with an in-flight submit; blocks resends and deletes. */
  beginSubmit: (key: string) => void;
  clearEnteringSession: () => void;
  discardDraft: (key: string) => void;
  /** Composer text keyed by draft location: a session id, or `draft:<n>`. */
  draftErrors: Map<string, AppError>;
  draftId: number;
  /** Last submit failure per draft location; cleared on the next attempt. */
  drafts: Map<string, string>;
  endDelete: (sessionId: string) => void;
  endSubmit: (key: string) => void;
  /** Session id whose sidebar row is playing its enter animation. */
  enteringSessionId: null | string;
  pendingDeletes: Set<string>;
  pendingSubmits: Set<string>;
  resolveSubmit: (key: string, submittedText: string) => void;
  setActiveSession: (id: null | string) => void;
  setDraft: (key: string, text: string) => void;
  setDraftError: (key: string, error: AppError | null) => void;
  setEnteringSession: (id: string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setThemeOverride: (override: ThemeOverride) => void;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  startNewChat: () => void;
  themeOverride: ThemeOverride;
  toggleSidebarCollapsed: () => void;
}

/** Draft location for the anonymous new-chat target: `draft:<draftId>`. */
export function draftKeyFor(draftId: number): string {
  return `draft:${String(draftId)}`;
}

export const useUiStore = create<UiState>()(
  immer((set) => ({
    activeSessionId: null,
    beginDelete: (sessionId) =>
      set((state) => {
        state.pendingDeletes.add(sessionId);
      }),
    beginSubmit: (key) =>
      set((state) => {
        state.pendingSubmits.add(key);
      }),
    clearEnteringSession: () =>
      set((state) => {
        state.enteringSessionId = null;
      }),
    discardDraft: (key) =>
      set((state) => {
        state.drafts.delete(key);
        state.draftErrors.delete(key);
      }),
    draftErrors: new Map(),
    draftId: 0,
    drafts: new Map(),
    endDelete: (sessionId) =>
      set((state) => {
        state.pendingDeletes.delete(sessionId);
      }),
    endSubmit: (key) =>
      set((state) => {
        state.pendingSubmits.delete(key);
      }),
    enteringSessionId: null,
    pendingDeletes: new Set(),
    pendingSubmits: new Set(),
    resolveSubmit: (key, submittedText) =>
      set((state) => {
        state.draftErrors.delete(key);
        // Only the submitted version is cleared; text typed after submitting
        // in another context survives untouched. The composer submits the
        // trimmed form, so leading/trailing whitespace does not distinguish
        // versions.
        if (state.drafts.get(key)?.trim() === submittedText) {
          state.drafts.delete(key);
        }
      }),
    setActiveSession: (activeSessionId) =>
      set((state) => {
        state.activeSessionId = activeSessionId;
      }),
    setDraft: (key, text) =>
      set((state) => {
        state.drafts.set(key, text);
      }),
    setDraftError: (key, error) =>
      set((state) => {
        if (error === null) {
          state.draftErrors.delete(key);
        } else {
          state.draftErrors.set(key, error);
        }
      }),
    setEnteringSession: (enteringSessionId) =>
      set((state) => {
        state.enteringSessionId = enteringSessionId;
      }),
    setSidebarCollapsed: (sidebarCollapsed) =>
      set((state) => {
        state.sidebarCollapsed = sidebarCollapsed;
      }),
    setSidebarWidth: (sidebarWidth) =>
      set((state) => {
        // Resize gestures overshoot the usable range; the store is the
        // single authority that keeps the width inside 220..440.
        state.sidebarWidth = Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth),
        );
      }),
    setThemeOverride: (themeOverride) =>
      set((state) => {
        state.themeOverride = themeOverride;
      }),
    sidebarCollapsed: false,
    sidebarWidth: 272,
    startNewChat: () =>
      set((state) => {
        // Starting the next draft revokes the previous anonymous draft and
        // its error; a submit still in flight must not resurrect either.
        const key = draftKeyFor(state.draftId);
        state.drafts.delete(key);
        state.draftErrors.delete(key);
        state.activeSessionId = null;
        state.draftId += 1;
      }),
    themeOverride: "system",
    toggleSidebarCollapsed: () =>
      set((state) => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
      }),
  })),
);
