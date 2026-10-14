import { useCallback, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { useCancelOnOutside } from './useCancelOnOutside.js'

/**
 * Keyboard and cancel handling for an inline draft: Enter calls `onSubmit`; Esc, a mouse press
 * outside the draft, and focus moving from inside the draft to an element outside it call
 * `onCancel`. The window losing focus (switching to another app) does not count. `onSubmit`
 * returns whether it consumed the draft: true closes the draft from here, false keeps the draft
 * and its text so the user can edit it and press Enter again. It must neither throw synchronously
 * nor reject; a failed write must be caught by the caller and return false.
 * `submit` is the same guarded entry for submissions other than Enter (such as clicking a
 * candidate), and `attempt` follows the same contract. Until a submission settles, neither Enter
 * nor `submit` sends a second one, and a press outside or focus leaving does not cancel. Once it
 * settles, a consumed draft closes as usual and an unconsumed one keeps the draft and its text,
 * wherever focus is by then. Esc is not affected and always cancels.
 * `row` is the element that counts as inside the draft; `triggers` are the entry buttons that can
 * reopen or focus it (except a Gantt milestone diamond). Anything in a Radix popper (calendar,
 * candidate dropdown, menu, and so on) also counts as inside, whether or not it was opened from here
 * and whether or not it is portaled to the body. Pressing `triggers` or such a popper, or moving
 * focus to them, does not leave the draft. While `row` is not mounted, neither the outside press
 * nor focus leaving cancels. Spread the returned `inputProps` onto the draft's input.
 */
export function useInlineDraft({ row, triggers, onSubmit, onCancel }: {
  row: RefObject<HTMLElement | null>
  triggers: Array<RefObject<HTMLElement | null>>
  onSubmit: () => boolean | Promise<boolean>
  onCancel: () => void
}): {
  inputProps: {
    autoComplete: 'off'
    autoFocus: true
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
  }
  cancel: () => void
  focus: () => void
  submit: (attempt: () => boolean | Promise<boolean>) => void
} {
  // Writes are asynchronous and the input stays after Enter; a second Enter in the same frame must
  // already be blocked, so this is a ref rather than state.
  const busy = useRef(false)
  // While a submission is pending, an outside press or focus leaving must not close the draft; once
  // the result is in, the onCancel() call in submit() decides.
  const cancelUnlessBusy = useCallback(() => { if (!busy.current) onCancel() }, [onCancel])
  useCancelOnOutside(row, cancelUnlessBusy, triggers)

  const submit = (attempt: () => boolean | Promise<boolean>) => {
    if (busy.current) return
    busy.current = true
    void Promise.resolve(attempt()).then((consumed) => {
      if (consumed) onCancel()
    }).finally(() => { busy.current = false })
  }

  return {
    inputProps: {
      autoComplete: 'off',
      autoFocus: true,
      onKeyDown: (e) => {
        if (e.key === 'Enter') submit(onSubmit)
        if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
      },
    },
    cancel: onCancel,
    focus: () => row.current?.querySelector('input')?.focus(),
    submit,
  }
}
