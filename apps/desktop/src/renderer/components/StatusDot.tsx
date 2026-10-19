import './StatusDot.css'

/** What a dot's colour says: a good, warning, failed or neutral state. */
export type StatusDotTone = 'good' | 'warn' | 'bad' | 'neutral'

/**
 * The one status dot, `sm` beside a line of text or inside a tag and `md` as a legend key. Without
 * `label` it is decorative and must sit next to text that names its state. With `label` it writes the
 * state's name after itself; `labelHidden` keeps that name as the dot's accessible name and tooltip
 * instead, for a dense row whose visible text names something else.
 */
export function StatusDot({ tone, size = 'sm', label, labelHidden = false }: {
  tone: StatusDotTone
  size?: 'sm' | 'md'
  label?: string
  labelHidden?: boolean
}) {
  const className = `status-dot status-dot--${size} status-dot--${tone}`
  if (label === undefined) return <span className={className} aria-hidden="true" />
  if (labelHidden) return <span className={className} role="img" aria-label={label} title={label} />
  return (
    <span className="status-dot-labelled">
      <span className={className} aria-hidden="true" /><span className="status-dot-label">{label}</span>
    </span>
  )
}
