import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useDrafts } from '../hooks/useDrafts.js'
import { NO_TRIGGERS } from '../hooks/useOnLeave.js'
import { useInlineDraft } from '../hooks/useInlineDraft.js'
import { useMessages } from '../messages/useMessages.js'
import { FormInput, FormTextarea, type FormControlAppearance } from './FormControls.js'

export type InlineFieldProps = {
  label: string
  value: string
  display?: ReactNode
  type?: 'text' | 'date'
  inputMode?: 'text' | 'numeric'
  onSave: (value: string) => boolean | Promise<boolean>
  wrapperClassName?: string
  buttonClassName?: string
  inputClassName?: string
  inputAppearance?: FormControlAppearance
  emptyText?: string
  normalize?: (value: string) => string
  validate?: (value: string) => boolean
  /** Edits in a wrapping field that grows with its text, for values whose display wraps; Enter still saves. */
  multiline?: boolean
  /**
   * Replaces the button the value rests in, for a value whose click belongs to the row or card around
   * it: renders the value at rest, given `edit`, which opens the editor from an explicit control.
   */
  rest?: (edit: () => void) => ReactNode
  /**
   * Keeps the value being typed as a draft under `target` of `scope` (see `useDrafts`): the field is
   * open while that draft exists, so it comes back open after a restart, and closing drops it.
   */
  keep?: { scope: readonly string[]; target: string }
}

const UNKEPT: readonly string[] = []

/**
 * Zotero-style single-value editor: at rest it is a plain property value whose whole cell shows
 * hover; a click replaces only this cell with an input control. Submitting and cancelling follow
 * `useInlineDraft`, the one convention across the app: Enter, focus leaving the control or a press
 * anywhere else saves, and Esc cancels; the window losing focus (switching to another app) does not
 * count as leaving. An unchanged value closes without calling `onSave`. `onSave` returns whether
 * the new value is accepted; when a write fails the editor stays open, so the three pages that use
 * it do not each implement their own async duplicate-submit guard. A click inside the open editor
 * stays there, so it never activates the row or card around the field. See `keep` for keeping
 * the value being typed.
 */
export function InlineField({
  label, value, display, type = 'text', inputMode, onSave,
  wrapperClassName = 'metadata-field', buttonClassName = 'metadata-editable',
  inputClassName = 'metadata-input', inputAppearance = 'plain', emptyText, normalize = (next) => next,
  validate = () => true, multiline = false, rest, keep,
}: InlineFieldProps) {
  const m = useMessages()
  const empty = emptyText ?? m.common.field.emptyValue
  const kept = useDrafts<string>(keep?.scope ?? UNKEPT)
  const keptText = keep === undefined ? undefined : kept.get(keep.target)
  const [ownEditing, setEditing] = useState(false)
  const [ownDraft, setOwnDraft] = useState(value)
  const editing = keep === undefined ? ownEditing : keptText !== undefined
  const draft = keep === undefined ? ownDraft : keptText ?? value
  const setDraft = (next: string) => {
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
    row: control, triggers: NO_TRIGGERS, onCancel: () => setEditing(false),
    kept: keep === undefined ? undefined : { drafts: kept, target: keep.target },
    onSubmit: () => {
      const next = normalize(draft)
      if (!validate(next)) return false
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
        <button type="button" className={buttonClassName} onClick={edit}>{(display ?? value) || empty}</button>
      )
      : rest(edit)
  } else if (multiline) {
    field = (
      <FormTextarea
        ref={holdControl} appearance={inputAppearance} className={`${inputClassName} multiline`}
        aria-label={m.common.field.edit(label)} rows={1} value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
        {...draftField.inputProps}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault()
          draftField.inputProps.onKeyDown(event)
        }}
      />
    )
  } else {
    field = (
      <FormInput
        ref={holdControl} appearance={inputAppearance} className={inputClassName}
        aria-label={m.common.field.edit(label)}
        type={type} inputMode={inputMode} value={draft}
        onChange={(event) => setDraft(event.target.value)} {...draftField.inputProps}
      />
    )
  }

  return (
    // The wrapper keeps the same node in both states, so Grid/Flex always measures the same value
    // cell and a native input's min-content width does not widen the property column on click.
    <span className={wrapperClassName} onClick={editing ? (event) => event.stopPropagation() : undefined}>
      {field}
    </span>
  )
}

/**
 * Metadata rows use the same compact inline-editor appearance as editable table text cells. A free-text
 * value wraps while it is shown, so it is edited in a wrapping field too.
 */
export function InlineMetadataField(props: Omit<InlineFieldProps,
  | 'wrapperClassName' | 'buttonClassName' | 'inputClassName' | 'inputAppearance'
  | 'emptyText' | 'normalize' | 'validate' | 'multiline'
>) {
  const freeText = props.type !== 'date' && props.inputMode !== 'numeric'
  return <InlineField {...props} inputAppearance="inline" multiline={freeText} />
}
