import { useMessages } from '../messages/useMessages.js'
import { RunningRing } from './icons.js'
import './LoadingPlaceholder.css'

/**
 * The forms a loading result can take: a list of rows, a list of cards, lines of text, a document
 * page, or one value of a field row, as a running ring.
 */
export type LoadingShape = 'rows' | 'cards' | 'lines' | 'sheet' | 'ring'

/** The value a `ring` stands in for, whose height it keeps: a line of text, a label tag, or a field. */
export type LoadingRingHolds = 'text' | 'tag' | 'field'

/**
 * The one loading state: grey blocks in the shape of the result, `count` rows, cards or lines (a
 * sheet is always one page), or a running ring where one value will be, as tall as the value it
 * `holds`. A screen shows it while its data is null, never an empty state, and swaps it for the
 * result, or for the error, once the fetch settles. It draws no text; screen readers hear it as
 * loading. It fades in only after a short pause, so a fast load shows nothing at all.
 */
export function LoadingPlaceholder(props: {
  shape: Exclude<LoadingShape, 'ring'>
  count?: number
  className?: string
} | {
  shape: 'ring'
  holds: LoadingRingHolds
  className?: string
}) {
  const m = useMessages()
  const { shape, className } = props
  const classes = props.shape === 'ring'
    ? `loading-placeholder loading-placeholder--ring loading-placeholder--holds-${props.holds}`
    : `loading-placeholder loading-placeholder--${shape}`
  return (
    <div className={className ? `${classes} ${className}` : classes} role="status" aria-label={m.common.loading} aria-busy="true">
      {props.shape === 'ring'
        ? <RunningRing />
        : Array.from({ length: props.shape === 'sheet' ? 1 : props.count ?? 3 }, (_, at) => <span key={at} />)}
    </div>
  )
}
