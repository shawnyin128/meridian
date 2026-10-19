import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NO_TRIGGERS } from '../hooks/useOnLeave.js'
import { useInlineDraft } from '../hooks/useInlineDraft.js'
import { useMessages } from '../messages/useMessages.js'
import { FormInput, FormSelect, FormTextarea, type FormControlAppearance } from './FormControls.js'

export type InlineFieldProps = {
  label: string
  value: string
  display?: ReactNode
  type?: 'text' | 'date'
  inputMode?: 'text' | 'numeric'
  options?: readonly string[]
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
}

/**
 * Zotero-style single-value editor: at rest it is a plain property value whose whole cell shows
 * hover; a click replaces only this cell with an input control. Submitting and cancelling follow
 * `useInlineDraft`, the one convention across the app: Enter, focus leaving the control or a press
 * anywhere else saves, and Esc cancels; the window losing focus (switching to another app) does not
 * count as leaving. An unchanged value closes without calling `onSave`. `onSave` returns whether
 * the new value is accepted; when a write fails the editor stays open, so the three pages that use
 * it do not each implement their own async duplicate-submit guard.
 */
export function InlineField({
  label, value, display, type = 'text', inputMode, options, onSave,
  wrapperClassName = 'metadata-field', buttonClassName = 'metadata-editable',
  inputClassName = 'metadata-input', inputAppearance = 'plain', emptyText, normalize = (next) => next,
  validate = () => true, multiline = false, rest,
}: InlineFieldProps) {
  const m = useMessages()
  const empty = emptyText ?? m.common.field.emptyValue
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const control = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [editing, value])

  useEffect(() => {
    if (!editing) return
    control.current?.focus()
  }, [editing])

  const draftField = useInlineDraft({
    row: control, triggers: NO_TRIGGERS, onCancel: () => setEditing(false),
    onSubmit: () => {
      const next = normalize(draft)
      if (!validate(next)) return false
      return next === value ? true : onSave(next)
    },
  })
  // Select, input and textarea each take a ref of their own element type; `control` holds their union.
  const holdControl = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => {
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
        <button
          type="button" className={buttonClassName} title={m.common.field.change(label)} onClick={edit}
        >{(display ?? value) || empty}</button>
      )
      : rest(edit)
  } else if (options !== undefined) {
    field = (
      <FormSelect
        ref={holdControl} appearance={inputAppearance} className={inputClassName}
        aria-label={m.common.field.edit(label)} value={draft}
        onChange={(event) => setDraft(event.target.value)} {...draftField.inputProps}
      >
        {options.map((option) => <option key={option}>{option}</option>)}
      </FormSelect>
    )
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
    // cell and a native input/select's min-content width does not widen the property column on click.
    <span className={wrapperClassName}>{field}</span>
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
  const freeText = props.options === undefined && props.type !== 'date' && props.inputMode !== 'numeric'
  return <InlineField {...props} inputAppearance="inline" multiline={freeText} />
}
