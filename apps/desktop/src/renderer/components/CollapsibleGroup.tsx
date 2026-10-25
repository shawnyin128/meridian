import { useState } from 'react'
import type { ReactNode } from 'react'
import { HeadingCount } from './HeadingCount.js'
import { Icon } from './icons.js'
import './CollapsibleGroup.css'

/**
 * A titled group in a long list whose heading stays pinned while its items scroll past and folds the
 * group away when clicked. `count` follows the title as `· N` when given, as a section heading's does; `actions` sit at the
 * heading's end and never toggle the group. `variant: 'quiet'` drops the sticky pinning and shrinks
 * the heading for a small group embedded inside another list, such as an archived section. A group
 * opened from its heading grows to its height; one that renders open, or that its owner opens, shows
 * in full at once; a closing one folds at once.
 */
export function CollapsibleGroup({
  title, count, open, onToggle, actions, children, variant = 'section', ...data
}: {
  title: ReactNode
  count?: number
  open: boolean
  onToggle: () => void
  actions?: ReactNode
  children: ReactNode
  variant?: 'section' | 'quiet'
} & { [key: `data-${string}`]: string }) {
  const [opening, setOpening] = useState(false)
  const classes = [
    'collapsible-group',
    variant === 'quiet' ? 'collapsible-group--quiet' : '',
    open ? '' : 'is-closed',
  ].filter(Boolean).join(' ')
  return (
    <section className={classes} {...data}>
      <div className="collapsible-group-head">
        <button
          type="button" className="collapsible-group-toggle" aria-expanded={open}
          onClick={() => { setOpening(!open); onToggle() }}
        >
          <span className="collapsible-group-caret"><Icon sw={2.4}><path d="M6 9l6 6 6-6" /></Icon></span>
          <span className="collapsible-group-label">
            <span className="collapsible-group-title">{title}</span>
            <HeadingCount count={count} />
          </span>
        </button>
        {actions === undefined ? null : <div className="collapsible-group-actions">{actions}</div>}
      </div>
      {open ? (
        <div className={opening ? 'collapsible-group-body is-opening' : 'collapsible-group-body'}>
          <div className="collapsible-group-content">{children}</div>
        </div>
      ) : null}
    </section>
  )
}
