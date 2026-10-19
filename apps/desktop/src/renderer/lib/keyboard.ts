/**
 * Whether a keydown arrives while an input method is composing text. Such a key belongs to the
 * input method: its Enter confirms a candidate and its Escape dismisses the candidate list, so the
 * field it lands in must not act on it.
 */
export function composing(key: Pick<KeyboardEvent, 'isComposing'>): boolean {
  return key.isComposing
}
