import {
  type ButtonHTMLAttributes,
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
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

/**
 * The one single-line field, boxed by default. Components keep their own layout classes; the
 * appearance sets the box, font and focus, so entering edit mode never makes the field taller,
 * shifts it down, or shows the browser's own blue frame.
 */
export const FormInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & ControlAppearanceProps
>(
  function FormInput({ appearance = 'field', className, ...props }, ref) {
    return <input ref={ref} className={classes('form-input', className, appearance)} {...props} />
  },
)

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

/** Multi-line text on the same focus and size base as single-line input; its component sets the height. */
export const FormTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & ControlAppearanceProps
>(
  function FormTextarea({ appearance = 'field', className, ...props }, ref) {
    return <textarea ref={ref} className={classes('form-textarea', className, appearance)} {...props} />
  },
)

/** A native dropdown on the shared input base; options, submission and field state stay with the caller. */
export const FormSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & ControlAppearanceProps
>(
  function FormSelect({ appearance = 'field', className, ...props }, ref) {
    return <select ref={ref} className={classes('form-select', className, appearance)} {...props} />
  },
)
