import { forwardRef, useRef, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { useMessages } from '../messages/useMessages.js'
import { FormInput, type FormControlAppearance } from './FormControls.js'
import { IconCross } from './icons.js'
import { Tooltip } from './Tooltip.js'
import './ClearableInput.css'

type ClearableInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & {
  value: string
  onClear: () => void
  appearance?: FormControlAppearance
  wrapperClassName?: string
  wrapperId?: string
  wrapperRef?: Ref<HTMLDivElement>
  leading?: ReactNode
  clearLabel?: string
}

/** A controlled single-line field with one stable trailing clear action and an optional leading icon inside the field. */
export const ClearableInput = forwardRef<HTMLInputElement, ClearableInputProps>(
  function ClearableInput({
    value, onClear, wrapperClassName = '', wrapperId, wrapperRef, leading,
    clearLabel, className, ...props
  }, forwardedRef) {
    const m = useMessages()
    const clear = clearLabel ?? m.common.field.clear
    const input = useRef<HTMLInputElement | null>(null)
    const setRef = (node: HTMLInputElement | null) => {
      input.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef !== null) forwardedRef.current = node
    }

    return (
      <div id={wrapperId} ref={wrapperRef} className={`clearable-input${wrapperClassName ? ` ${wrapperClassName}` : ''}`}>
        {leading === undefined ? null : <span className="clearable-input-leading">{leading}</span>}
        <FormInput ref={setRef} className={className} value={value} {...props} />
        {value === '' ? null : (
          <Tooltip label={clear}>
            <button
              className="clearable-input-action" type="button" aria-label={clear}
              onClick={() => {
                onClear()
                input.current?.focus()
              }}
            >
              <IconCross sw={2.2} />
            </button>
          </Tooltip>
        )}
      </div>
    )
  },
)
