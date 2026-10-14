import {
  type ButtonHTMLAttributes,
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { useMessages } from '../messages/useMessages.js'
import { IconFolder } from './icons.js'
import './FormControls.css'

export type FormControlAppearance = 'plain' | 'field' | 'inline'

type ControlAppearanceProps = {
  appearance?: FormControlAppearance
}

const classes = (
  kind: string,
  className: string | undefined,
  appearance: FormControlAppearance,
) => `form-control ${kind} form-control-${appearance}${className ? ` ${className}` : ''}`

/**
 * The stable base for every single-line native input. Components keep their own layout and
 * appearance classes; this sets only the box model, font and focus behavior, so entering edit mode
 * never makes the field taller, shifts it down, or shows the browser's own blue frame.
 */
export const FormInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & ControlAppearanceProps
>(
  function FormInput({ appearance = 'plain', className, ...props }, ref) {
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
        <FormInput ref={ref} appearance="field" disabled={disabled} {...props} />
        <button
          type="button"
          className="directory-field-action"
          title={choose}
          aria-label={choose}
          disabled={disabled || chooseDisabled || choosing}
          onClick={onChoose}
        >
          <IconFolder />
        </button>
      </span>
    )
  },
)

/** Field-shaped button for values that enter a separate editing state when activated. */
export const FormButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & ControlAppearanceProps
>(
  function FormButton({ appearance = 'plain', className, type = 'button', ...props }, ref) {
    return <button ref={ref} type={type} className={classes('form-button', className, appearance)} {...props} />
  },
)

/** Multi-line text on the same focus and size base as single-line input; its component sets the height. */
export const FormTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & ControlAppearanceProps
>(
  function FormTextarea({ appearance = 'plain', className, ...props }, ref) {
    return <textarea ref={ref} className={classes('form-textarea', className, appearance)} {...props} />
  },
)

/** A native dropdown on the shared input base; options, submission and field state stay with the caller. */
export const FormSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & ControlAppearanceProps
>(
  function FormSelect({ appearance = 'plain', className, ...props }, ref) {
    return <select ref={ref} className={classes('form-select', className, appearance)} {...props} />
  },
)
