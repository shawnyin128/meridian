import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { useMessages } from '../messages/useMessages.js'
import { IconButton } from './IconButton.js'

/**
 * Shared history-return action, the same icon button as the panel close in every head it sits in.
 * Other props and the ref go to the button, so it can be the trigger of a confirmation.
 */
export const BackButton = forwardRef<HTMLButtonElement, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children' | 'className' | 'title'>>(
  function BackButton(props, ref) {
    const m = useMessages()
    return (
      <IconButton {...props} ref={ref} label={m.common.nav.back} className="back">
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </IconButton>
    )
  },
)
