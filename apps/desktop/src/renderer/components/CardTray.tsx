import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { FadeText } from './FadeText.js'
import { FoldToggle } from './FoldToggle.js'
import './CardTray.css'

/**
 * Progressive-disclosure surface for secondary details. The summary stays in place while the detail
 * area expands below it, so the host never shifts its identity or primary actions; a fold toggle
 * leads the summary with its caret. `tray` is a filled one-line tray inside a card, its toggle named
 * by `expandLabel` and `collapseLabel`; `row` draws no surface of its own, for a list row whose
 * summary is the row itself and names the toggle. A `composite` row's summary holds a control of its
 * own, such as an entity link, so the toggle, named by the summary, lies over the caret and the
 * summary instead of holding them, and the control sits above it.
 */
export function CardTray({
  summary, children, action, variant = 'tray', composite = false, expandLabel, collapseLabel, defaultOpen = false,
  className = '',
}: {
  summary: ReactNode
  children: ReactNode
  action?: ReactNode
  defaultOpen?: boolean
  className?: string
} & (
  | { variant?: 'tray'; composite?: never; expandLabel: string; collapseLabel: string }
  | { variant: 'row'; composite?: boolean; expandLabel?: never; collapseLabel?: never }
)) {
  const [open, setOpen] = useState(defaultOpen)
  const detailId = useId()
  const label = variant === 'row' ? undefined : open ? collapseLabel : expandLabel
  const text = <FadeText className="card-tray-summary">{summary}</FadeText>
  const toggle = () => setOpen((held) => !held)
  return (
    <div className={`card-tray card-tray--${variant}${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <div className="card-tray-head">
        {composite
          ? (
            <FoldToggle variant="composite" className="card-tray-toggle" open={open} controls={detailId} onToggle={toggle}>
              {text}
            </FoldToggle>
          )
          : (
            <FoldToggle className="card-tray-toggle" label={label} open={open} controls={detailId} onToggle={toggle}>
              {text}
            </FoldToggle>
          )}
        {action === undefined ? null : <div className="card-tray-action">{action}</div>}
      </div>
      <div className="card-tray-reveal" id={detailId} aria-hidden={!open}>
        <div className="card-tray-content">{children}</div>
      </div>
    </div>
  )
}
