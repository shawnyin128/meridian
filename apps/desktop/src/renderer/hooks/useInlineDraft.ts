import { useCallback, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { useCancelOnOutside } from './useCancelOnOutside.js'

/**
 * Keyboard and cancellation of in-place occupancy: press Enter to call `onSubmit`; Esc, mouse click outside the occupancy, and focus moves from inside the occupancy to outside the occupancy
 * On the element, `onCancel` is adjusted, and the window being out of focus (switching to another application) does not count. `onSubmit` returns whether this is a placeholder
 * Used - if true, the placeholder will be collected from here, if not, the placeholder and the words inside will be retained, and people can change it and press Enter; it is not allowed to be thrown synchronously
 * It is also not allowed to reject. If the writing fails, you must catch it yourself and return false.
 * `submit` is a protected submission entry outside the carriage return (such as a mouse click candidate), and `attempt` follows the same convention. once
 * Before the submission is completed, neither press Enter nor `submit` will send a second message, and you will not give up even if you click outside the placeholder or leave the focus; wait for this submission.
 * There is a result - if it is used, it is put away as usual; if it is not used, the placeholder and words are kept, regardless of whether the focus is on it at that time. Esc is not affected by this
 * The impact is still clear abandonment.
 * `row` is the element counted as "within the placeholder", `triggers` is the entry button that can reopen or focus the placeholder
 * (Except Gantt diamond); any content in the Radix popper floating layer (calendar, association drop-down, menu, etc.) is also considered a placeholder.
 * Within, no matter whether it is opened from this place or whether it is portaled to the body. Click on `triggers` to bring focus to them
 * Or this type of floating layer does not count as leaving the placeholder; when `row` is not mounted, the two judgments of the point outside and the focus leaving will not take effect. returned
 * `inputProps` is allocated to the input box in the placeholder.
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
  // Writing is asynchronous, and the input box is still there after pressing Enter; the second time it is written, it will be blocked at this frame, so it is ref instead of state.
  const busy = useRef(false)
  // When submitting on the way, press and hold the click outside or the focus away to prevent them from closing the placeholder; return the result to the sentence in submit() after it comes out
  // onCancel() tube
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
