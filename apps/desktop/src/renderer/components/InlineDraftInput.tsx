import { forwardRef, useCallback, useRef } from 'react'
import type {
  ForwardedRef, InputHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, RefObject,
} from 'react'
import { NO_TRIGGERS } from '../hooks/useCancelOnOutside.js'
import { useInlineDraft } from '../hooks/useInlineDraft.js'
import { FormInput } from './FormControls.js'

export type InlineDraftInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onSubmit'> & {
  /**
   * The entire placeholder editing area. When peer controls such as date and status are also considered internal to the editor, the outer rows are passed in; when omitted, the input box
   * You are the editing area.
   */
  scopeRef?: RefObject<HTMLElement | null>
  /** You can open or refocus this placeholder entry. Clicking on them does not leave the editing area. */
  triggers?: Array<RefObject<HTMLElement | null>>
  /** Press Enter to submit the normalized text; the placeholder will be closed only when true is returned. */
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
 * New/placeholder input box for all applications. It ties the input DOM to the lifecycle of `useInlineDraft`: autofocus,
 * Enter submits, Esc, off-point and focus leave cancellation, prevent duplication during asynchronous submission and lock off-point cancellation. Business components are only responsible for
 * Peer-to-peer layout and writing actions, no more typing keyboard, focus and busy rules by yourself.
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
