import { useMessages } from '../messages/useMessages.js'
import { IconButton } from './IconButton.js'

/**
 * Shared history-return action, the same icon button as the panel close in every head it sits in.
 */
export function BackButton({ onClick }: { onClick: () => void }) {
  const m = useMessages()
  return (
    <IconButton label={m.common.nav.back} className="back" onClick={onClick}>
      <svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </IconButton>
  )
}
