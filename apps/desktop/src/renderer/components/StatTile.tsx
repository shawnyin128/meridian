import { Card } from './Card.js'
import './StatTile.css'

/**
 * One figure with its label under it, on a card. `state` `error` colours the figure's text, for a
 * figure that needs attention; the tile itself stays neutral.
 */
export function StatTile({ value, label, state }: { value: number | string; label: string; state?: 'error' | undefined }) {
  return (
    <Card className={state === undefined ? 'stat-tile' : `stat-tile stat-tile--${state}`}>
      <b className="stat-tile-value">{value}</b><span className="stat-tile-label">{label}</span>
    </Card>
  )
}
