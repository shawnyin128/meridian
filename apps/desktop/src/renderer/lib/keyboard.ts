import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { appMenu } from '../ipc.js'

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
 * Whether a keydown commits a multi-line text: Enter with the platform's command key (see
 * `pressesCommand`), ⌘Enter on macOS and Ctrl+Enter elsewhere, outside an input method composition.
 * A plain Enter starts a new line there.
 */
export function commitsMultiline(platform: string, key: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'isComposing'>): boolean {
  return pressesCommand(platform, key, 'Enter') && !composing(key)
}

/**
 * The keys of a field being edited, as its `onKeyDown`. Enter in a one-line field, or Enter with the
 * App's platform's command key in a `multiline` one (see `commitsMultiline`), calls `onSave` and keeps
 * the key from doing anything else, such as starting a line or submitting a form. With `onCancel`,
 * Escape calls it and goes no further than the field; without it, Escape passes on to what holds the
 * field. The keys of an input method composition are the input method's: they neither save nor
 * cancel.
 */
export function commitKeys({ multiline = false, onSave, onCancel }: {
  multiline?: boolean
  onSave?: () => void
  onCancel?: () => void
}): (event: ReactKeyboardEvent) => void {
  return (event) => {
    if (event.key === 'Escape' && onCancel !== undefined) {
      event.stopPropagation()
      if (!composing(event.nativeEvent)) onCancel()
      return
    }
    if (onSave === undefined) return
    const commits = multiline
      ? commitsMultiline(appMenu.platform(), event.nativeEvent)
      : event.key === 'Enter' && !composing(event.nativeEvent)
    if (!commits) return
    event.preventDefault()
    onSave()
  }
}

/**
 * The label of the shortcut that is `key` pressed with the platform's command key, ⌘ on macOS and
 * Ctrl elsewhere, and with Shift too when `shift` is set: ⇧⌘P on macOS, Ctrl+Shift+P elsewhere.
 */
export function commandShortcut(platform: string, key: string, shift = false): string {
  if (platform === 'darwin') return `${shift ? '⇧' : ''}⌘${key}`
  return `Ctrl+${shift ? 'Shift+' : ''}${key}`
}

/**
 * Whether a keydown is `letter` pressed with the platform's command key, the shortcut
 * `commandShortcut(platform, letter)` names: ⌘ on macOS, Ctrl elsewhere. On macOS a Control-letter
 * belongs to the text system, where Control-B moves the caret back one character.
 */
export function pressesCommand(platform: string, key: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>, letter: string): boolean {
  return (platform === 'darwin' ? key.metaKey : key.ctrlKey) && key.key.toLowerCase() === letter.toLowerCase()
}

/**
 * Whether `target` is a place text is typed in: a field, a select or editable content. Keys that edit
 * text there, such as Backspace, or that move its caret, such as Alt+Arrow, belong to it.
 */
export function typesText(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}
