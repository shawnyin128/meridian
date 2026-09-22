import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NO_TRIGGERS } from '../hooks/useCancelOnOutside.js'
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
}

/**
 * Zotero-style single value editor: When resting, it is a normal attribute value, and the entire grid is hovered; clicking only replaces this grid with an input control.
 * Submit and give up using `useInlineDraft`, a set of standards common to all applications: write only after pressing Enter, move the focus outside the control or click on
 * Giving up everything else, leaving no words typed, and the window being out of focus (cutting to another application) does not count as leaving. `onSave` returns whether to accept the new value,
 * When writing fails, the editing state is retained to prevent the three business pages from implementing asynchronous anti-replication.
 */
export function InlineField({
  label, value, display, type = 'text', inputMode, options, onSave,
  wrapperClassName = 'metadata-field', buttonClassName = 'metadata-editable',
  inputClassName = 'metadata-input', inputAppearance = 'plain', emptyText, normalize = (next) => next,
  validate = () => true, multiline = false,
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
  // Select and input each require a ref of a specific element type, and the applicable control is their union type.
  const holdControl = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => {
    control.current = element
  }

  let field: ReactNode
  if (!editing) {
    field = (
      <button
        type="button" className={buttonClassName} title={m.common.field.change(label)}
        onClick={() => { setDraft(value); setEditing(true) }}
      >{(display ?? value) || empty}</button>
    )
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
    // The outer layer does not change nodes with the editing state: Grid/Flex always measures the same value grid, native input/select
    // The min-content width will not expand the property bar after clicking.
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
