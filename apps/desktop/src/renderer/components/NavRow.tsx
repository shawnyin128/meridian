import type { ReactNode } from 'react'
import { CountBadge } from './CountBadge.js'
import { FoldToggle } from './FoldToggle.js'
import { useToolbarItem } from './Toolbar.js'
import './NavRow.css'

/** The fold of the group under a navigation row: what folds it, whether it shows and the id of the group. */
type NavRowFold = { label: string; open: boolean; onToggle: () => void; controls: string }

type NavRowProps = {
  /** The row's text. */
  children: ReactNode
  /** The glyph before the text, in a slot of one width so the texts of a list line up. */
  icon?: ReactNode
  /** The count at the row's end; a row shows none for 0 or for a count not known yet. */
  count?: number | null | undefined
  /** A state shown at the row's end, such as a tag. */
  end?: ReactNode
  /** The row's own controls at its end, such as a "More" menu; each stops its click from reaching the row. */
  actions?: ReactNode
  /** How far the row sits in: 1 under a top row, 2 under that. */
  indent?: 0 | 1 | 2
  /** The smaller text of a row that lists one item of a group, such as one watch. */
  sub?: boolean
  /** Greys the text of a row whose destination is paused. */
  dim?: boolean
  selected?: boolean
  /** Classes that only name the row. */
  className?: string
  id?: string
} & (
  | { onActivate: () => void; fold?: NavRowFold | undefined }
  | { onActivate?: undefined; fold: Omit<NavRowFold, 'label'> }
) & { [key: `data-${string}`]: string }

/**
 * One row of a navigation list, such as the sidebar or the Settings categories, at one height whatever
 * it holds: `icon`, the text, and `count` or `end` at its end. A row is one button, activated by a
 * click, Enter or Space. A row with `actions` or `fold` stays a div whose button is its label; a pointer
 * click anywhere else on it activates it too. `fold` puts the caret that folds the group under the row
 * right after its label. A row without `onActivate` opens nothing: the whole row is the fold toggle of
 * its group, its caret after its text. `selected` marks the row whose destination is shown, whose
 * accent turns to the neutral selected look while Meridian is not the active app. In a toolbar the
 * row's buttons are controls of the toolbar.
 */
export function NavRow({
  children, icon, count, end, actions, indent = 0, sub = false, dim = false, selected = false, className, onActivate, fold, id,
  ...data
}: NavRowProps) {
  const asItem = useToolbarItem()
  const classes = (...own: string[]) => [...own, indent === 0 ? '' : `nav-row--indent-${indent}`, sub ? 'nav-row--sub' : '',
    dim ? 'dim' : '', selected ? 'on' : '', className].filter(Boolean).join(' ')
  const glyph = icon === undefined ? null : <span className="nav-row-icon">{icon}</span>
  const tail = (
    <>
      {count === undefined || count === null || count === 0 ? null : <CountBadge className="nav-row-count" count={count} />}
      {end === undefined ? null : <span className="nav-row-end">{end}</span>}
    </>
  )
  if (onActivate === undefined) {
    return (
      <FoldToggle {...data} className={classes('nav-row')} open={fold.open} onToggle={fold.onToggle} controls={fold.controls} end={tail}>
        {glyph}{children}
      </FoldToggle>
    )
  }
  if (actions === undefined && fold === undefined) {
    return asItem(
      <button type="button" className={classes('nav-row')} id={id} onClick={onActivate} {...data}>{glyph}{children}{tail}</button>,
    )
  }
  return (
    <div className={classes('nav-row', actions === undefined ? '' : 'nav-row--actions')} id={id} onClick={onActivate} {...data}>
      {asItem(<button type="button" className="nav-row-label">{glyph}{children}</button>)}
      {fold === undefined ? null : <FoldToggle variant="caret" {...fold} />}
      {tail}
      {actions}
    </div>
  )
}
