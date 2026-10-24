import './ProgressFill.css'

/**
 * The app's one progress presentation, up to `percent` (0–100). The `fill` look fills the status
 * surface's own background left to right: put it first inside an element with the `progress-host`
 * class; the host's other children stay above the fill. The `line` look is a thin neutral bar of its
 * own in the flow, as wide as its box.
 */
export function ProgressFill({ percent, label, look = 'fill' }: { percent: number; label: string; look?: 'fill' | 'line' }) {
  return (
    <div
      className={look === 'line' ? 'progress-fill progress-fill--line' : 'progress-fill'} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  )
}
