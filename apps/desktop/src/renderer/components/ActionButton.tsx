import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * A text button that starts an action and shows while that action runs: with `busy` it reads
 * `busyLabel` in place of its children, is marked `aria-busy`, and is disabled, so a second press
 * cannot start the action again. Every other attribute goes to the button as given.
 */
export const ActionButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { busy: boolean; busyLabel: ReactNode }
>(
  function ActionButton({ busy, busyLabel, disabled, children, ...props }, ref) {
    return (
      <button ref={ref} {...props} disabled={disabled === true || busy} aria-busy={busy || undefined}>
        {busy ? busyLabel : children}
      </button>
    )
  },
)
