import { forwardRef, useCallback, useLayoutEffect, useRef } from 'react'
import type {
  ForwardedRef, InputHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, RefObject,
} from 'react'
import { NO_TRIGGERS } from '../hooks/useOnLeave.js'
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
  /**
   * Enter or leaving the draft submits the normalized text, with whether the draft is being left; the
   * draft closes only when this returns true. Leaving with no text closes the draft without calling it.
   */
  onSubmit: (value: string, leaving: boolean) => boolean | Promise<boolean>
  onCancel: () => void
  normalize?: (value: string) => string
  validate?: (value: string) => boolean
  /** Holds, while this draft is mounted, its `leave`: see `afterLeaving`. */
  leaveRef?: RefObject<(() => Promise<boolean>) | null>
}

/**
 * Runs `next`, which replaces the draft whose `leaveRef` this is, once that draft has been left as a
 * press outside would leave it: at once when no draft is mounted, and not at all when the draft
 * stays open because its save was refused, so it keeps its text and shows the refusal.
 */
export function afterLeaving(leaveRef: RefObject<(() => Promise<boolean>) | null>, next: () => void): void {
  const leave = leaveRef.current
  if (leave === null) next()
  else void leave().then((left) => { if (left) next() })
}

function assignRef(ref: ForwardedRef<HTMLInputElement>, node: HTMLInputElement | null): void {
  if (typeof ref === 'function') ref(node)
  else if (ref !== null) ref.current = node
}

/**
 * The app-wide input for a new item or an inline draft. It ties the input element to the
 * `useInlineDraft` lifecycle: autofocus, Enter, an outside press or focus leaving to submit, cancel
 * on Esc, and no duplicate submission while an asynchronous submission is pending. Feature
 * components handle only the sibling layout and the write, and no longer write their own keyboard,
 * focus and busy rules. The input carries `data-inline-draft`, so a modal dialog leaves Esc to it.
 */
export const InlineDraftInput = forwardRef<HTMLInputElement, InlineDraftInputProps>(
  function InlineDraftInput({
    scopeRef, triggers = NO_TRIGGERS, onSubmit, onCancel,
    normalize = (value) => value.trim(), validate = (value) => value !== '', leaveRef,
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
      onSubmit: (leaving) => {
        const value = normalize(input.current?.value ?? '')
        return validate(value) ? onSubmit(value, leaving) : false
      },
      isEmpty: () => normalize(input.current?.value ?? '') === '',
    })
    useLayoutEffect(() => {
      if (leaveRef === undefined) return undefined
      leaveRef.current = draft.leave
      return () => { leaveRef.current = null }
    })
    const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
      draft.inputProps.onKeyDown(event)
      onKeyDown?.(event)
    }

    return (
      <FormInput
        {...props} ref={holdInput} data-inline-draft="" autoComplete={autoComplete} autoFocus={autoFocus}
        aria-invalid={draft.inputProps['aria-invalid']} onInput={draft.inputProps.onInput}
        onKeyDown={handleKeyDown}
      />
    )
  },
)
