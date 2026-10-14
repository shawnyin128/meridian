import { forwardRef, useCallback, useRef } from 'react'
import type {
  ForwardedRef, InputHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, RefObject,
} from 'react'
import { NO_TRIGGERS } from '../hooks/useCancelOnOutside.js'
import { useInlineDraft } from '../hooks/useInlineDraft.js'
import { FormInput } from './FormControls.js'

export type InlineDraftInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onSubmit'> & {
  /**
   * The whole draft area. Pass the outer row when sibling controls such as date and status also count
   * as inside the editor; when omitted, the input alone is the draft area.
   */
  scopeRef?: RefObject<HTMLElement | null>
  /** Entry buttons that can open or refocus this draft; pressing them does not leave the draft. */
  triggers?: Array<RefObject<HTMLElement | null>>
  /** Enter submits the normalized text; the draft closes only when this returns true. */
  onSubmit: (value: string) => boolean | Promise<boolean>
  onCancel: () => void
  normalize?: (value: string) => string
  validate?: (value: string) => boolean
}

function assignRef(ref: ForwardedRef<HTMLInputElement>, node: HTMLInputElement | null): void {
  if (typeof ref === 'function') ref(node)
  else if (ref !== null) ref.current = node
}

/**
 * The app-wide input for a new item or an inline draft. It ties the input element to the
 * `useInlineDraft` lifecycle: autofocus, Enter to submit, cancel on Esc, an outside press or focus
 * leaving, and no duplicate submission or outside-press cancel while an asynchronous submission is
 * pending. Feature components handle only the sibling layout and the write, and no longer write
 * their own keyboard, focus and busy rules.
 */
export const InlineDraftInput = forwardRef<HTMLInputElement, InlineDraftInputProps>(
  function InlineDraftInput({
    scopeRef, triggers = NO_TRIGGERS, onSubmit, onCancel,
    normalize = (value) => value.trim(), validate = (value) => value !== '',
    onKeyDown, autoComplete = 'off', autoFocus = true, ...props
  }, forwardedRef) {
    const input = useRef<HTMLInputElement>(null)
    const holdInput = useCallback((node: HTMLInputElement | null) => {
      input.current = node
      assignRef(forwardedRef, node)
    }, [forwardedRef])
    const draft = useInlineDraft({
      row: scopeRef ?? input,
      triggers,
      onCancel,
      onSubmit: () => {
        const value = normalize(input.current?.value ?? '')
        return validate(value) ? onSubmit(value) : false
      },
    })
    const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
      draft.inputProps.onKeyDown(event)
      onKeyDown?.(event)
    }

    return (
      <FormInput
        {...props} ref={holdInput} autoComplete={autoComplete} autoFocus={autoFocus}
        onKeyDown={handleKeyDown}
      />
    )
  },
)
