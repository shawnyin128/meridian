import type { ReactNode } from 'react'
import { FoldToggle } from './FoldToggle.js'
import './NavSection.css'

/**
 * A titled section of a navigation list. Its heading, one row of 24px, folds the rows under it, which
 * stay mounted while folded; the group of rows is `sect-<id>`. A section given no `fold`, as in a
 * preview of the list, has a heading that folds nothing. `action` is the heading's own control at its
 * end, such as the ＋ that creates in the section, and never folds it. The title, or its fold toggle, is
 * a second-level heading for screen readers, without the action beside it.
 */
export function NavSection({ id, title, fold, action, children }: {
  id: string
  title: string
  fold?: { open: boolean; onToggle: () => void }
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <div className="nav-section-head" data-sect={id}>
        <span role="heading" aria-level={2} className="nav-section-title">
          {fold === undefined ? title : <FoldToggle open={fold.open} onToggle={fold.onToggle} controls={`sect-${id}`}>{title}</FoldToggle>}
        </span>
        {action === undefined ? null : <span className="nav-section-action">{action}</span>}
      </div>
      {fold === undefined ? children : <div id={`sect-${id}`} hidden={!fold.open}>{children}</div>}
    </>
  )
}
