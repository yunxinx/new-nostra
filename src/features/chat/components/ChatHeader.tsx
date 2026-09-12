import { useUiStore } from "@/stores/ui-store";

import { ModelPicker } from "./ModelPicker";

interface ChatHeaderProps {
  composerKey: string;
}

export function ChatHeader({ composerKey }: ChatHeaderProps) {
  const model = useUiStore((s) => s.modelByDraft.get(composerKey) ?? null);
  const setModel = useUiStore((s) => s.setModel);

  return (
    <div className="flex min-w-0 items-center">
      <ModelPicker
        model={model}
        onPick={(next) => setModel(composerKey, next)}
      />
    </div>
  );
}
