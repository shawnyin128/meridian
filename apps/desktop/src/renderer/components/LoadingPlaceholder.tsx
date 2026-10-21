import { useMessages } from '../messages/useMessages.js'
import './LoadingPlaceholder.css'

/** The forms a loading result can take: a list of rows, a list of cards, lines of text, a document page. */
export type LoadingShape = 'rows' | 'cards' | 'lines' | 'sheet'

/**
 * The one loading state: grey blocks in the shape of the result, `count` rows, cards or lines (a
 * sheet is always one page). A screen shows it while its data is null, never an empty state, and
 * swaps it for the result, or for the error, once the fetch settles. It draws no text; screen readers
 * hear it as loading. It fades in only after a short pause, so a fast load shows nothing at all.
 */
export function LoadingPlaceholder({ shape, count = 3, className }: {
  shape: LoadingShape
  count?: number
  className?: string
}) {
  const m = useMessages()
  return (
    <div
      className={`loading-placeholder loading-placeholder--${shape}${className ? ` ${className}` : ''}`}
      role="status" aria-label={m.common.loading} aria-busy="true"
    >
      {Array.from({ length: shape === 'sheet' ? 1 : count }, (_, at) => <span key={at} />)}
    </div>
  )
}
