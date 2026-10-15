import { useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { useOnLeave } from './useOnLeave.js'

/**
 * Keyboard and leave handling for an inline draft: Enter calls `onSubmit`, and so does leaving the
 * draft, by a mouse press outside it or focus moving from inside it to an element outside it; Esc
 * calls `onCancel`. Leaving a draft for which `isEmpty` returns true calls `onCancel` instead of
 * submitting; without `isEmpty`, leaving always submits. The window losing focus (switching to
 * another app) does not count as leaving. `onSubmit` receives whether the draft is being left, and
 * returns whether it consumed the draft: true closes the draft from here, false keeps the draft and
 * its text so the user can edit it and submit again. A submission made by leaving that returns
 * false also marks the input invalid (`aria-invalid`) until its text changes or the draft closes,
 * and leaving again does not resubmit before the text changes. `onSubmit` must neither throw
 * synchronously nor reject; a failed write must be caught by the caller and return false.
 * `submit` is the same guarded entry for submissions other than Enter (such as clicking a
 * candidate), and `attempt` follows the same contract. Until a submission settles, neither Enter,
 * `submit` nor leaving sends a second one. Once it settles, a consumed draft closes as usual and an
 * unconsumed one keeps the draft and its text, wherever focus is by then. Esc is not affected and
 * always cancels.
 * `row` is the element that counts as inside the draft; `triggers` are the entry buttons that can
 * reopen or focus it (except a Gantt milestone diamond). Anything in a Radix popper (calendar,
 * candidate dropdown, menu, and so on) also counts as inside, whether or not it was opened from here
 * and whether or not it is portaled to the body. Pressing `triggers` or such a popper, or moving
 * focus to them, does not leave the draft. While `row` is not mounted, neither the outside press
 * nor focus leaving counts. Spread the returned `inputProps` onto the draft's input.
 */
export function useInlineDraft({ row, triggers, onSubmit, onCancel, isEmpty }: {
  row: RefObject<HTMLElement | null>
  triggers: Array<RefObject<HTMLElement | null>>
  onSubmit: (leaving: boolean) => boolean | Promise<boolean>
  onCancel: () => void
  isEmpty?: () => boolean
}): {
  inputProps: {
    autoComplete: 'off'
    autoFocus: true
    'aria-invalid': true | undefined
    onInput: () => void
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
  }
  cancel: () => void
  focus: () => void
  submit: (attempt: () => boolean | Promise<boolean>) => void
} {
  // Writes are asynchronous and the input stays after Enter; a second Enter in the same frame must
  // already be blocked, so this is a ref rather than state.
  const busy = useRef(false)
  // A press outside is followed by focus leaving, so a refused leave must already block the second
  // one in the same gesture; the state only renders it.
  const refused = useRef(false)
  const [invalid, setInvalid] = useState(false)

  const clearInvalid = () => {
    refused.current = false
    setInvalid(false)
  }
  const close = () => {
    clearInvalid()
    onCancel()
  }
  const submit = (attempt: () => boolean | Promise<boolean>, leaving = false) => {
    if (busy.current) return
    busy.current = true
    void Promise.resolve(attempt()).then((consumed) => {
      if (consumed) close()
      else if (leaving) {
        refused.current = true
        setInvalid(true)
      }
    }).finally(() => { busy.current = false })
  }
  useOnLeave(row, () => {
    if (busy.current || refused.current) return
    if (isEmpty?.() === true) close()
    else submit(() => onSubmit(true), true)
  }, triggers)

  return {
    inputProps: {
      autoComplete: 'off',
      autoFocus: true,
      'aria-invalid': invalid || undefined,
      onInput: clearInvalid,
      onKeyDown: (e) => {
        if (e.key === 'Enter') submit(() => onSubmit(false))
        if (e.key === 'Escape') { e.stopPropagation(); close() }
      },
    },
    cancel: close,
    focus: () => row.current?.querySelector('input')?.focus(),
    submit,
  }
}
