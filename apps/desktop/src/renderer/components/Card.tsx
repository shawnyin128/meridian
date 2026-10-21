import type { HTMLAttributes, ReactNode } from 'react'
import './Card.css'

/**
 * The one card surface of a screen's sections, such as the Settings cards: a hairline border, the
 * card radius and fill, and padding. A `flush` card leaves the padding to its rows; a `floating` card
 * lies above the page, on the floating surface with its shadow for an edge. `className` only places
 * the card or lays out its content.
 */
export function Card({ children, className, flush = false, floating = false, as: Tag = 'div', ...props }: {
  children: ReactNode
  className?: string
  flush?: boolean
  floating?: boolean
  as?: 'div' | 'section'
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>) {
  const classes = ['card-surface', flush ? 'card-surface--flush' : '', floating ? 'card-surface--floating' : '', className]
    .filter(Boolean).join(' ')
  return <Tag className={classes} {...props}>{children}</Tag>
}
