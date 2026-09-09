import { createContext } from "react";

interface ComposerFocusRequest {
  onFocusRestored: () => void;
  shouldRestoreFocus: boolean;
}

export const ComposerFocusContext = createContext<ComposerFocusRequest | null>(
  null,
);
