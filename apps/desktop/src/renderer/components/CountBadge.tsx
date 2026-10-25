import type { MouseEvent } from 'react'
import './CountBadge.css'

type CountBadgeProps = {
  count: number
  /** Placement only; the badge's box, fill and type are its own. */
  className?: string | undefined
} & (
  | { onClick?: never; label?: never; more?: never }
  | {
    onClick: (event: MouseEvent<HTMLButtonElement>) => void
    label?: string | undefined
    /** The badge counts the items folded away; `open` while they are unfolded. */
    more?: { open: boolean } | undefined
  }
)

/**
 * The one count beside a row or button label, in the quiet badge look; zero shows as 0. With
 * `onClick` it is a button in the same look, named by `label`, that opens what it counts. With
 * `more` it counts the items folded away as +N and unfolds them, and shows − while they are unfolded.
 */
export function CountBadge({ count, className, onClick, label, more }: CountBadgeProps) {
  const placed = className ? ` ${className}` : ''
  if (onClick === undefined) return <span className={`count-badge${placed}`}>{count}</span>
  return (
    <button
      type="button" className={`count-badge${placed}`} aria-label={label}
      aria-expanded={more?.open} onClick={onClick}
    >{more === undefined ? count : more.open ? '−' : `+${count}`}</button>
  )
}
