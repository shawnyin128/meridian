import { useMessages } from '../messages/useMessages.js'

/**
 * Shared history-return action. Its containing navigation surface owns its presentation.
 */
export function BackButton({ onClick }: { onClick: () => void }) {
  const m = useMessages()
  return (
    <button className="back" title={m.common.nav.back} onClick={onClick}>
      <svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  )
}
