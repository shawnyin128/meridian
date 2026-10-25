import {
  type ButtonHTMLAttributes,
  createContext,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { useMessages } from '../messages/useMessages.js'
import { IconFolder } from './icons.js'
import { Tooltip } from './Tooltip.js'
import './FormControls.css'

/**
 * `field` is the boxed field of forms, dialogs, popovers and filters; `inline` edits a value in the
 * place of its text in a row, cell or property list; `chip` edits a chip's value in the chip's place
 * and box. `plain` draws no field, for a control inside a host that draws one around it, such as the
 * chat composer.
 */
export type FormControlAppearance = 'plain' | 'field' | 'inline' | 'chip'

type ControlAppearanceProps = {
  appearance?: FormControlAppearance
}

const classes = (
  kind: string,
  className: string | undefined,
  appearance: FormControlAppearance,
) => `form-control ${kind} form-control-${appearance}${className ? ` ${className}` : ''}`

/** The id the label of the FieldRow around a text field names it by. */
const FieldRowId = createContext<string | undefined>(undefined)

/**
 * The one single-line field, boxed by default. Components keep their own layout classes; the
 * appearance sets the box, font and focus, so entering edit mode never makes the field taller,
 * shifts it down, or shows the browser's own blue frame. Inside a FieldRow it takes the id the
 * row's label names, unless it has an id of its own.
 */
export const FormInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & ControlAppearanceProps
>(
  function FormInput({ appearance = 'field', className, id, ...props }, ref) {
    const rowId = useContext(FieldRowId)
    return <input ref={ref} id={id ?? rowId} className={classes('form-input', className, appearance)} {...props} />
  },
)

/**
 * One labelled field: `label`, in the label column, then the field, or the controls that set one
 * value, which start where the fields of every other row of the same FieldRows start. A text field
 * inside is named by the label, and a press on the label focuses it. A row without a label spans the
 * label column too. Inside a FieldRows or a DraftForm the label column is as wide as their longest
 * label; on its own, as wide as its label.
 */
export function FieldRow({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className={`field-row${className === undefined ? '' : ` ${className}`}`}>
      {label === undefined ? null : <label className="field-row-label" htmlFor={id}>{label}</label>}
      <div className="field-row-field">
        <FieldRowId.Provider value={label === undefined ? undefined : id}>{children}</FieldRowId.Provider>
      </div>
    </div>
  )
}

/** Field rows that share one label column; anything else placed among them spans both columns. */
export function FieldRows({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={`field-rows${className === undefined ? '' : ` ${className}`}`}>{children}</div>
}

type DirectoryFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  chooseDisabled?: boolean
  chooseLabel?: string
  choosing?: boolean
  onChoose: () => void
}

/** A path field and its system directory chooser are one control, with a consistent trailing folder action. */
export const DirectoryField = forwardRef<HTMLInputElement, DirectoryFieldProps>(
  function DirectoryField({
    chooseDisabled = false,
    chooseLabel,
    choosing = false,
    onChoose,
    disabled,
    ...props
  }, ref) {
    const m = useMessages()
    const choose = chooseLabel ?? m.common.field.chooseDirectory
    return (
      <span className="directory-field" aria-busy={choosing || undefined}>
        <FormInput ref={ref} disabled={disabled} {...props} />
        <Tooltip label={choose}>
          <button
            type="button"
            className="directory-field-action"
            aria-label={choose}
            disabled={disabled || chooseDisabled || choosing}
            onClick={onChoose}
          >
            <IconFolder />
          </button>
        </Tooltip>
      </span>
    )
  },
)

/** Field-shaped button for values that enter a separate editing state when activated. */
export const FormButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & ControlAppearanceProps
>(
  function FormButton({ appearance = 'field', className, type = 'button', ...props }, ref) {
    return <button ref={ref} type={type} className={classes('form-button', className, appearance)} {...props} />
  },
)

/**
 * Multi-line text on the same focus and size base as single-line input; its component sets the
 * height. `code` shows text that is source, such as a page's Markdown, in the code font. Inside a
 * FieldRow it takes the id the row's label names, as FormInput does.
 */
export const FormTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & ControlAppearanceProps & { code?: boolean }
>(
  function FormTextarea({ appearance = 'field', code = false, className, id, ...props }, ref) {
    const rowId = useContext(FieldRowId)
    return (
      <textarea
        ref={ref} id={id ?? rowId} {...props}
        className={classes('form-textarea', code ? `form-control-code${className ? ` ${className}` : ''}` : className, appearance)}
      />
    )
  },
)

/** A native dropdown on the shared input base; options, submission and field state stay with the caller. */
export const FormSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & ControlAppearanceProps
>(
  function FormSelect({ appearance = 'field', className, id, ...props }, ref) {
    const rowId = useContext(FieldRowId)
    return <select ref={ref} id={id ?? rowId} className={classes('form-select', className, appearance)} {...props} />
  },
)

/** `#rrggbb` for a colour written `#RRGGBB`, `RRGGBB`, `#RGB` or `RGB` in either case; null for any other text. */
const hexColour = (text: string): string | null => {
  const digits = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)?.[1]?.toLowerCase()
  if (digits === undefined) return null
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits}`
}

/**
 * A colour as one field: its leading swatch opens the system colour picker, and the rest is the value
 * as text, shown as `#RRGGBB`. `onChange` receives `#rrggbb` for every colour the picker gives and
 * every text written `#RRGGBB`, `RRGGBB`, `#RGB` or `RGB` in either case; the text stays as typed
 * until the field loses focus. Any other text changes nothing and shows refused once the field loses
 * focus, until it is edited. `pickLabel` and `valueLabel` name the picker and the text.
 */
export function ColourField({ value, onChange, pickLabel, valueLabel }: {
  value: string
  onChange: (value: string) => void
  pickLabel: string
  valueLabel: string
}) {
  const [text, setText] = useState(value.toUpperCase())
  const [refused, setRefused] = useState(false)
  // A short colour is the start of a long one, so the text is not rewritten while it is being typed.
  const typing = useRef(false)
  useEffect(() => {
    if (typing.current) return
    setText(value.toUpperCase())
    setRefused(false)
  }, [value])
  return (
    <span className="colour-field">
      <input
        type="color" className="colour-field-picker" value={value.toLowerCase()} aria-label={pickLabel}
        onChange={(event) => onChange(event.target.value.toLowerCase())}
      />
      <FormInput
        value={text} aria-label={valueLabel} aria-invalid={refused || undefined} spellCheck={false} maxLength={7}
        onFocus={() => { typing.current = true }}
        onChange={(event) => {
          setText(event.target.value)
          setRefused(false)
          const colour = hexColour(event.target.value)
          if (colour !== null) onChange(colour)
        }}
        onBlur={() => {
          typing.current = false
          if (hexColour(text) === null) setRefused(true)
          else setText(value.toUpperCase())
        }}
      />
    </span>
  )
}
