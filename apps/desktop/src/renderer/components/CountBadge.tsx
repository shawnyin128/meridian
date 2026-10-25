import type { MouseEvent } from 'react'
import './CountBadge.css'

type CountBadgeProps = {
  count: number
  /** Placement only; the badge's box, fill and type are its own. */
  className?: string | undefined
} & (
  | { more?: never; label?: never; onClick?: never }
  | {
    /** The badge counts the items folded away; `open` while they are unfolded. */
    more: { open: boolean }
    label: string
    onClick: (event: MouseEvent<HTMLButtonElement>) => void
  }
)

/**
 * The one count beside a row or button label, in the quiet badge look; zero shows as 0. With `more`
 * it is a button in the same look, named by `label`, that counts the items folded away as +N and
 * unfolds them, and shows − while they are unfolded.
 */
export function CountBadge({ count, className, more, label, onClick }: CountBadgeProps) {
  const placed = className ? ` ${className}` : ''
  if (more === undefined) return <span className={`count-badge${placed}`}>{count}</span>
  return (
    <button type="button" className={`count-badge${placed}`} aria-label={label} aria-expanded={more.open} onClick={onClick}>
      {more.open ? '−' : `+${count}`}
    </button>
  )
}
