// Last input modality for the window. Radix returns focus to the trigger
// whenever an overlay closes, which leaves a lingering focus ring for pointer
// users — worst when the chosen action unfocuses the window (opening the
// settings window) and nothing clears the ring until the next click. A
// keyboard user's focus must return to a predictable place, so only
// pointer-initiated closes skip the return.
// Written by document-level capture listeners, read at close time. Blur
// carries no pointer or key events, so an unfocused window keeps its last
// recorded modality.
let lastInputWasPointer = false;

// Wraps an onCloseAutoFocus handler so pointer-initiated closes drop Radix's
// focus return. A caller-provided handler runs after the guard.
export function suppressPointerFocusReturn(
  onCloseAutoFocus?: (event: Event) => void,
) {
  return (event: Event) => {
    if (lastInputWasPointer) {
      event.preventDefault();
    }
    onCloseAutoFocus?.(event);
  };
}

// Installs the capture listeners for as long as the caller is mounted. Call
// from an overlay's Root, which mounts before the opening interaction can
// reach the Content. Nested callers are safe: each add pairs with its own
// remove, and every listener writes the same value.
export function trackPointerModality(): () => void {
  const markPointerInput = () => {
    lastInputWasPointer = true;
  };
  const markKeyboardInput = () => {
    lastInputWasPointer = false;
  };
  document.addEventListener("keydown", markKeyboardInput, true);
  document.addEventListener("pointerdown", markPointerInput, true);
  return () => {
    document.removeEventListener("keydown", markKeyboardInput, true);
    document.removeEventListener("pointerdown", markPointerInput, true);
  };
}
