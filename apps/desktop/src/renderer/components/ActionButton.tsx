import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { RunningRing } from './icons.js'
import './ActionButton.css'

/**
 * A text button that starts an action and shows while that action runs: with `busy` it keeps its
 * width and shows the RunningRing in place of its children, is named `busyLabel` and marked
 * `aria-busy`, and is disabled, so a second press cannot start the action again. Every other
 * attribute goes to the button as given.
 */
export const ActionButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { busy: boolean; busyLabel: string }
>(
  function ActionButton({ busy, busyLabel, disabled, className, children, ...props }, ref) {
    return (
      <button
        ref={ref} {...props} className={className === undefined ? 'action-button' : `action-button ${className}`}
        disabled={disabled === true || busy} aria-busy={busy || undefined} aria-label={busy ? busyLabel : props['aria-label']}
      >
        {busy ? <><span className="action-label">{children}</span><RunningRing /></> : children}
      </button>
    )
  },
)
