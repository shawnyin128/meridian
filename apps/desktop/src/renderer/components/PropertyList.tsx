import type { ReactNode } from 'react'
import './PropertyList.css'

/**
 * The one label/value list: each Property's label in the label column, as wide as the longest label,
 * and its value after it. `aligned` takes the label column of the grid the list lies in instead, so
 * several lists of one card start their values at one x. `aria-labelledby` names the list.
 */
export function PropertyList({ aligned = false, className, 'aria-labelledby': labelledBy, children }: {
  aligned?: boolean
  className?: string
  'aria-labelledby'?: string | undefined
  children: ReactNode
}) {
  const classes = ['property-list', aligned ? 'property-list--aligned' : '', className].filter(Boolean).join(' ')
  return <dl className={classes} aria-labelledby={labelledBy}>{children}</dl>
}

/** One property of a PropertyList: `label`, then the value `children`, a text or the control that edits it. */
export function Property({ label, className, children }: { label: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={className === undefined ? 'property' : `property ${className}`}>
      <dt className="property-label">{label}</dt>
      <dd className="property-value">{children}</dd>
    </div>
  )
}
