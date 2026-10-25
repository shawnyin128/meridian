import './ProgressFill.css'

/**
 * The app's one progress presentation: a thin line along the bottom edge of the status surface fills
 * left to right up to `percent` (0–100). Put it first inside an element with the `progress-host`
 * class; the host's other children stay above the line.
 */
export function ProgressFill({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      className="progress-fill" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  )
}
