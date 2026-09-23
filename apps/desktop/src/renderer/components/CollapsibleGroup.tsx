import type { ReactNode } from 'react'
import { Icon } from './icons.js'
import './CollapsibleGroup.css'

/**
 * A titled group in a long list whose heading stays pinned while its items scroll past and folds the
 * group away when clicked. `count` is shown beside the title when given; `actions` sit at the
 * heading's end and never toggle the group. `variant: 'quiet'` drops the sticky pinning and shrinks
 * the heading for a small group embedded inside another list, such as an archived section.
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
  const classes = [
    'collapsible-group',
    variant === 'quiet' ? 'collapsible-group--quiet' : '',
    open ? '' : 'is-closed',
  ].filter(Boolean).join(' ')
  return (
    <section className={classes} {...data}>
      <div className="collapsible-group-head">
        <button type="button" className="collapsible-group-toggle" aria-expanded={open} onClick={onToggle}>
          <span className="collapsible-group-caret"><Icon sw={2.4}><path d="M6 9l6 6 6-6" /></Icon></span>
          <span className="collapsible-group-title">{title}</span>
          {count === undefined ? null : <span className="collapsible-group-count">{count}</span>}
        </button>
        {actions === undefined ? null : <div className="collapsible-group-actions">{actions}</div>}
      </div>
      {open ? <div className="collapsible-group-body">{children}</div> : null}
    </section>
  )
}
