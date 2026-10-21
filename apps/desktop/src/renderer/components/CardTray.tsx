import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevron } from './icons.js'
import { Tooltip } from './Tooltip.js'
import { FadeText } from './FadeText.js'
import './CardTray.css'

/**
 * Progressive-disclosure surface for secondary details. The summary stays in place while the detail
 * area expands below it, so the host never shifts its identity or primary actions. `tray` is a filled
 * one-line tray inside a card, its toggle named by `expandLabel` and `collapseLabel`; `row` draws no
 * surface of its own and leads with the caret, for a list row whose summary is the row itself and
 * names the toggle.
 */
export function CardTray({
  summary, children, action, variant = 'tray', expandLabel, collapseLabel, defaultOpen = false, className = '',
}: {
  summary: ReactNode
  children: ReactNode
  action?: ReactNode
  defaultOpen?: boolean
  className?: string
} & (
  | { variant?: 'tray'; expandLabel: string; collapseLabel: string }
  | { variant: 'row'; expandLabel?: never; collapseLabel?: never }
)) {
  const [open, setOpen] = useState(defaultOpen)
  const detailId = useId()
  const label = variant === 'row' ? undefined : open ? collapseLabel : expandLabel
  const chevron = <span className="card-tray-chevron" aria-hidden="true"><IconChevron /></span>
  return (
    <div className={`card-tray card-tray--${variant}${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <div className="card-tray-head">
        <Tooltip label={label}>
          <button
            className="card-tray-toggle" type="button" aria-expanded={open}
            aria-controls={detailId} aria-label={label}
            onClick={() => setOpen((held) => !held)}
          >
            {variant === 'row' ? chevron : null}
            <FadeText className="card-tray-summary">{summary}</FadeText>
            {variant === 'row' ? null : chevron}
          </button>
        </Tooltip>
        {action === undefined ? null : <div className="card-tray-action">{action}</div>}
      </div>
      <div className="card-tray-reveal" id={detailId} aria-hidden={!open}>
        <div className="card-tray-content">{children}</div>
      </div>
    </div>
  )
}
