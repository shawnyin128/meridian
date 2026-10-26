import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useDrafts } from '../hooks/useDrafts.js'
import { NO_TRIGGERS } from '../hooks/useOnLeave.js'
import { useInlineDraft } from '../hooks/useInlineDraft.js'
import { useMessages } from '../messages/useMessages.js'
import { FormInput, FormTextarea } from './FormControls.js'
import './InlineField.css'

export type InlineFieldProps = {
  label: string
  value: string
  display?: ReactNode
  type?: 'text' | 'date'
  inputMode?: 'text' | 'numeric'
  onSave: (value: string) => boolean | Promise<boolean>
  /** Places the field; its looks at rest and while editing are its own. */
  className?: string
  /**
   * `title` is a page title's look: one line as wide as the text, up to the room it has; the field keeps
   * the title's own font.
   */
  variant?: 'title'
  emptyText?: string
  normalize?: (value: string) => string
  validate?: (value: string) => boolean
  /** Edits in a wrapping field that grows with its text, for values whose display wraps; Enter still saves. */
  multiline?: boolean
  /**
   * Replaces the button the value rests in, for a name renamed from its … menu: the name at rest. The
   * field then opens only from its kept draft, which the menu's Rename sets (see `keep` and DotsMenu).
   */
  rest?: ReactNode
  /**
   * Keeps the value being typed as a draft under `target` of `scope` (see `useDrafts`): the field is
   * open while that draft exists, so it comes back open after a restart, and closing drops it.
   */
  keep?: { scope: readonly string[]; target: string }
  /**
   * Makes this the editor of a table cell its table opens and closes, the cell's `celledit` input: it
   * is open from the start, presses inside `ref`, the cell, stay inside it, and `onClose` runs once
   * it closes, saved or cancelled. The table shows the value at rest.
   */
  cell?: { ref: RefObject<HTMLElement | null>; onClose: () => void }
}

const UNKEPT: readonly string[] = []

/**
 * The one in-place editor of a value, a name included: at rest it is the value as text whose whole
 * cell shows hover; a click, or for a name its … menu's Rename, replaces only this cell with the
 * inline field, the text staying where it was. Submitting and cancelling follow
 * `useInlineDraft`, the one convention across the app: Enter, focus leaving the control or a press
 * anywhere else saves, and Esc cancels; the window losing focus (switching to another app) does not
 * count as leaving. An unchanged value closes without calling `onSave`; a value `validate` refuses
 * keeps the field open and marks it invalid until it is edited. `onSave` returns whether
 * the new value is accepted; when a write fails the editor stays open, so the three pages that use
 * it do not each implement their own async duplicate-submit guard. A click inside the open editor
 * stays there, so it never activates the row or card around the field. See `keep` for keeping
 * the value being typed.
 */
export function InlineField({
  label, value, display, type = 'text', inputMode, onSave, className, variant, emptyText, normalize = (next) => next,
  validate = () => true, multiline = false, rest, keep, cell,
}: InlineFieldProps) {
  const m = useMessages()
  const empty = emptyText ?? m.common.field.emptyValue
  const kept = useDrafts<string>(keep?.scope ?? UNKEPT)
  const keptText = keep === undefined ? undefined : kept.get(keep.target)
  const [ownEditing, setEditing] = useState(false)
  const [ownDraft, setOwnDraft] = useState(value)
  const editing = cell !== undefined || (keep === undefined ? ownEditing : keptText !== undefined)
  const draft = keep === undefined ? ownDraft : keptText ?? value
  const [refused, setRefused] = useState(false)
  const setDraft = (next: string) => {
    setRefused(false)
    if (keep === undefined) setOwnDraft(next)
    else kept.set(keep.target, next)
  }
  const control = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) setOwnDraft(value)
  }, [editing, value])

  useEffect(() => {
    if (!editing) return
    control.current?.focus()
  }, [editing])

  const draftField = useInlineDraft({
    row: cell?.ref ?? control, triggers: NO_TRIGGERS, onCancel: cell?.onClose ?? (() => setEditing(false)),
    kept: keep === undefined ? undefined : { drafts: kept, target: keep.target },
    onSubmit: () => {
      const next = normalize(draft)
      if (!validate(next)) {
        setRefused(true)
        return false
      }
      return next === value ? true : onSave(next)
    },
  })
  // Input and textarea each take a ref of their own element type; `control` holds their union.
  const holdControl = (element: HTMLInputElement | HTMLTextAreaElement | null) => {
    control.current = element
  }

  const edit = () => {
    setDraft(value)
    setEditing(true)
  }

  let field: ReactNode
  if (!editing) {
    field = rest === undefined
      ? (
        <button type="button" className="metadata-editable" onClick={edit}>{(display ?? value) || empty}</button>
      )
      : rest
  } else if (multiline) {
    field = (
      <FormTextarea
        ref={holdControl} appearance="inline" className="metadata-input multiline"
        aria-label={m.common.field.edit(label)} rows={1} value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
        {...draftField.inputProps} aria-invalid={draftField.inputProps['aria-invalid'] ?? (refused || undefined)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault()
          draftField.inputProps.onKeyDown(event)
        }}
      />
    )
  } else {
    field = (
      <FormInput
        ref={holdControl} appearance="inline" className={cell === undefined ? 'metadata-input' : 'metadata-input celledit'}
        aria-label={m.common.field.edit(label)}
        type={type} inputMode={inputMode} value={draft}
        onChange={(event) => setDraft(event.target.value)} {...draftField.inputProps}
        aria-invalid={draftField.inputProps['aria-invalid'] ?? (refused || undefined)}
      />
    )
  }

  return (
    // The wrapper keeps the same node in both states, so Grid/Flex always measures the same value
    // cell and a native input's min-content width does not widen the property column on click.
    <span
      className={['metadata-field', variant === undefined ? '' : `metadata-field--${variant}`, className].filter(Boolean).join(' ')}
      onClick={editing ? (event) => event.stopPropagation() : undefined}
    >
      {field}
    </span>
  )
}

/**
 * A property's value edited in place. A free-text value wraps while it is shown, so it is edited in a
 * wrapping field too.
 */
export function InlineMetadataField(props: Omit<InlineFieldProps,
  | 'className' | 'variant' | 'emptyText' | 'normalize' | 'validate' | 'multiline' | 'cell'
>) {
  const freeText = props.type !== 'date' && props.inputMode !== 'numeric'
  return <InlineField {...props} multiline={freeText} />
}
