import type { SessionModel } from "@/types/ipc";

import { useUiStore } from "@/stores/ui-store";

import {
  useSessionModel,
  useSetSessionModel,
} from "../hooks/use-session-model";
import { ModelPicker } from "./ModelPicker";

interface ChatHeaderProps {
  composerKey: string;
  /** The session the composer writes to; null while it holds an unsaved draft. */
  sessionId: null | string;
}

/**
 * The model the composer speaks to. Where the selection is kept depends on
 * what the composer is writing to: a stored session holds it on its own row,
 * an unsaved draft keeps it in memory until the first send carries it into the
 * row that session becomes.
 */
export function ChatHeader({ composerKey, sessionId }: ChatHeaderProps) {
  const draftModel = useUiStore((s) => s.modelByDraft.get(composerKey) ?? null);
  const sessionModel = useSessionModel(sessionId);
  const setDraftModel = useUiStore((s) => s.setModel);
  const saveSessionModel = useSetSessionModel();
  const model = sessionId === null ? draftModel : sessionModel;

  function pick(next: SessionModel): void {
    if (sessionId === null) {
      setDraftModel(composerKey, next);
      return;
    }
    saveSessionModel.mutate({ model: next, sessionId });
  }

  return (
    <div className="flex min-w-0 items-center">
      <ModelPicker model={model} onPick={pick} />
    </div>
  );
}
