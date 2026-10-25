import type { ReactNode } from 'react'
import { FoldToggle } from './FoldToggle.js'
import { useToolbarItem } from './Toolbar.js'
import './NavRow.css'

/** The fold of the group under a navigation row: what folds it, whether it shows and the id of the group. */
type NavRowFold = { label: string; open: boolean; onToggle: () => void; controls: string }

/**
 * One row of a navigation list, such as the sidebar or the Settings categories. A plain row is one
 * button, activated by a click, Enter or Space. A row given a `label` holds controls of its own among
 * `children`, such as a "More" menu: it stays a div whose button is the `label`, and a pointer click
 * anywhere else on the row activates it too, so each control in `children` must stop its click from
 * reaching the row. Such a row can carry `fold`, the caret right after its label that folds the
 * group under the row, named by `fold.label`. `className` gives the row its look; `selected` adds `on` for the row whose
 * destination is shown. In a toolbar the row's buttons are controls of the toolbar.
 */
export function NavRow({
  children, label, fold, className, selected = false, onActivate, id, ...data
}: {
  children: ReactNode
  className: string
  selected?: boolean
  onActivate: () => void
  id?: string
} & ({ label?: undefined; fold?: never } | { label: ReactNode; fold?: NavRowFold | undefined })
  & { [key: `data-${string}`]: string }) {
  const asItem = useToolbarItem()
  const rowClass = selected ? `${className} on` : className
  if (label === undefined) {
    return asItem(
      <button
        type="button" className={`nav-row ${rowClass}`} id={id}
        onClick={onActivate} {...data}
      >{children}</button>,
    )
  }
  return (
    <div className={rowClass} id={id} onClick={onActivate} {...data}>
      {asItem(<button type="button" className="nav-row nav-row-label">{label}</button>)}
      {fold === undefined ? null : <FoldToggle variant="caret" {...fold} />}
      {children}
    </div>
  )
}
