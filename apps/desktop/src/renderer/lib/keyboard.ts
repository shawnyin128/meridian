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

/**
 * Whether a keydown commits a multi-line text: ⌘Enter or Ctrl+Enter outside an input method
 * composition. A plain Enter starts a new line there.
 */
export function commitsMultiline(key: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'isComposing'>): boolean {
  return key.key === 'Enter' && (key.metaKey || key.ctrlKey) && !composing(key)
}

/**
 * The label of the shortcut that is `key` pressed with the platform's command key, ⌘ on macOS and
 * Ctrl elsewhere, and with Shift too when `shift` is set: ⇧⌘P on macOS, Ctrl+Shift+P elsewhere.
 */
export function commandShortcut(platform: string, key: string, shift = false): string {
  if (platform === 'darwin') return `${shift ? '⇧' : ''}⌘${key}`
  return `Ctrl+${shift ? 'Shift+' : ''}${key}`
}
