import { Button } from './Button.js'
import { IconButton } from './IconButton.js'
import { IconMinus, IconPlus } from './icons.js'
import { Toolbar } from './Toolbar.js'
import { Tooltip } from './Tooltip.js'
import './ZoomControl.css'

/** How far one press of zoom in or out moves the zoom. */
const STEP = 0.2

/** `zoom` one step out (`-1`) or in (`1`), to the nearest tenth, so the percentage shown stays a round one. */
export function zoomStep(zoom: number, direction: -1 | 1): number {
  return Math.round((zoom + direction * STEP) * 10) / 10
}

/**
 * The one zoom control over a view that zooms: zoom out, the zoom in percent, which resets it, and
 * zoom in, one Tab stop with the arrow keys between them. A button at a limit is disabled. `onZoom`
 * gets the direction of a step, which the view takes with `zoomStep`. `place` is where it floats over
 * the view: centred at its `bottom` or in its top-right `corner`.
 */
export function ZoomControl({ zoom, min, max, onZoom, onReset, labels, place }: {
  zoom: number
  min: number
  max: number
  onZoom: (direction: -1 | 1) => void
  onReset: () => void
  labels: { out: string; in: string; reset: string }
  place: 'bottom' | 'corner'
}) {
  return (
    <Toolbar>
      <div className={`zoom-control zoom-control--${place}`}>
        <IconButton label={labels.out} size="nested" disabled={zoom <= min} onClick={() => onZoom(-1)}><IconMinus /></IconButton>
        <Tooltip label={labels.reset}>
          <Button size="compact" variant="ghost" className="zoom-control-reset" onClick={onReset}>{Math.round(zoom * 100)}%</Button>
        </Tooltip>
        <IconButton label={labels.in} size="nested" disabled={zoom >= max} onClick={() => onZoom(1)}><IconPlus /></IconButton>
      </div>
    </Toolbar>
  )
}
