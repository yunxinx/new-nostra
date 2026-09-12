import { useEffect, useState } from "react";

interface DraftGuardOptions {
  isChanged: boolean;
  isNavRequested?: boolean;
  isSaving: boolean;
  onLeave: () => void;
  onNavRequestResolved?: ((accepted: boolean) => void) | undefined;
}

export function useDraftGuard({
  isChanged,
  isNavRequested = false,
  isSaving,
  onLeave,
  onNavRequestResolved,
}: DraftGuardOptions) {
  const [isLeaveRequested, setIsLeaveRequested] = useState(false);
  useEffect(() => {
    if (isNavRequested && !isChanged && !isSaving) onNavRequestResolved?.(true);
  }, [isChanged, isNavRequested, isSaving, onNavRequestResolved]);

  function requestLeave(): void {
    if (isSaving) return;
    if (isChanged) setIsLeaveRequested(true);
    else onLeave();
  }

  function cancel(): void {
    setIsLeaveRequested(false);
    if (isNavRequested) onNavRequestResolved?.(false);
  }

  function confirm(): void {
    if (isSaving) return;
    setIsLeaveRequested(false);
    if (isNavRequested) onNavRequestResolved?.(true);
    else onLeave();
  }

  return {
    cancel,
    confirm,
    isBlocked: !isSaving && (isLeaveRequested || (isNavRequested && isChanged)),
    requestLeave,
  };
}
