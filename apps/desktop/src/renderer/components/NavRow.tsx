import type { CSSProperties, ReactNode } from 'react'
import './NavRow.css'

/**
 * One row of a navigation list, such as the sidebar or the Settings categories. A plain row is one
 * button, activated by a click, Enter or Space. A row given a `label` holds controls of its own among
 * `children`, such as a collapse caret or a "More" menu: it stays a div whose button is the `label`,
 * and a pointer click anywhere else on the row activates it too, so each control in `children` must
 * stop its click from reaching the row. `className` gives the row its look; `selected` adds `on` for
 * the row whose destination is shown, and `expanded` is the state of a row that folds a group.
 */
export function NavRow({
  children, label, className, selected = false, expanded, onActivate, id, style, ...data
}: {
  children: ReactNode
  label?: ReactNode
  className: string
  selected?: boolean
  expanded?: boolean
  onActivate: () => void
  id?: string
  style?: CSSProperties
} & { [key: `data-${string}`]: string }) {
  const rowClass = selected ? `${className} on` : className
  if (label === undefined) {
    return (
      <button
        type="button" className={`nav-row ${rowClass}`} id={id} style={style} aria-expanded={expanded}
        onClick={onActivate} {...data}
      >{children}</button>
    )
  }
  return (
    <div className={rowClass} id={id} style={style} onClick={onActivate} {...data}>
      <button type="button" className="nav-row nav-row-label" aria-expanded={expanded}>{label}</button>
      {children}
    </div>
  )
}
