export function isComposing(event: KeyboardEvent): boolean {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- keyCode 229 identifies IME confirmation after compositionend; revoke when supported WebViews report isComposing consistently.
  return event.isComposing || event.keyCode === 229;
}
