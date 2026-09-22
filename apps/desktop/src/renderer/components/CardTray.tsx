import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevron } from './icons.js'
import './CardTray.css'

/**
 * Progressive-disclosure surface for secondary card details. The summary stays one line high while
 * the detail area expands below it, so the host card never shifts its identity or primary actions.
 */
export function CardTray({
  summary, children, action, expandLabel, collapseLabel, defaultOpen = false, className = '',
}: {
  summary: ReactNode
  children: ReactNode
  action?: ReactNode
  expandLabel: string
  collapseLabel: string
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const detailId = useId()
  const label = open ? collapseLabel : expandLabel
  return (
    <div className={`card-tray${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <div className="card-tray-head">
        <button
          className="card-tray-toggle" type="button" aria-expanded={open}
          aria-controls={detailId} aria-label={label} title={label}
          onClick={() => setOpen((held) => !held)}
        >
          <span className="card-tray-summary">{summary}</span>
          <span className="card-tray-chevron" aria-hidden="true"><IconChevron /></span>
        </button>
        {action === undefined ? null : <div className="card-tray-action">{action}</div>}
      </div>
      <div className="card-tray-reveal" id={detailId} aria-hidden={!open}>
        <div className="card-tray-content">{children}</div>
      </div>
    </div>
  )
}
