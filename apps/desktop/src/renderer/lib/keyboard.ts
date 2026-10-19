/**
 * Whether a keydown arrives while an input method is composing text. Such a key belongs to the
 * input method: its Enter confirms a candidate and its Escape dismisses the candidate list, so the
 * field it lands in must not act on it.
 */
export function composing(key: Pick<KeyboardEvent, 'isComposing'>): boolean {
  return key.isComposing
}

/**
 * An `onEscapeKeyDown` for a Radix layer that keeps the layer open on an Escape pressed while an
 * input method is composing: that Escape is default-prevented, which stops Radix from dismissing,
 * and does not reach `then`. Every other Escape goes to `then`, if given.
 */
export function ignoreComposingEscape(then?: (event: KeyboardEvent) => void): (event: KeyboardEvent) => void {
  return (event) => {
    if (composing(event)) event.preventDefault()
    else then?.(event)
  }
}
