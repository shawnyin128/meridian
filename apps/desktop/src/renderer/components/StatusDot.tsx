import { Tooltip } from './Tooltip.js'
import { FadeText } from './FadeText.js'
import './StatusDot.css'

/** What a dot's colour says: a good, warning, failed or neutral state, or that something new is waiting. */
export type StatusDotTone = 'good' | 'warn' | 'bad' | 'neutral' | 'new'

/**
 * The one status dot, `sm` beside a line of text or inside a tag, `md` as a legend key and `nav` in the
 * glyph slot of a navigation row, filled with its tone, or with `fill` half-filled or a hollow ring in it. Without
 * `label` it is decorative and must sit next to text that names its state. With `label` it writes the
 * state's name after itself; `labelHidden` keeps that name as the dot's accessible name and tooltip
 * instead, for a dense row whose visible text names something else.
 */
export function StatusDot({ tone, size = 'sm', fill = 'full', label, labelHidden = false }: {
  tone: StatusDotTone
  size?: 'sm' | 'md' | 'nav'
  fill?: 'full' | 'half' | 'ring'
  label?: string
  labelHidden?: boolean
}) {
  const className = `status-dot status-dot--${size} status-dot--${tone}${fill === 'full' ? '' : ` status-dot--${fill}`}`
  if (label === undefined) return <span className={className} aria-hidden="true" />
  if (labelHidden) return <Tooltip label={label}><span className={className} role="img" aria-label={label} /></Tooltip>
  return (
    <span className="status-dot-labelled">
      <span className={className} aria-hidden="true" /><FadeText className="status-dot-label">{label}</FadeText>
    </span>
  )
}
