import { ToggleGroup, ToggleItem } from './Toolbar.js'
import { Tooltip } from './Tooltip.js'
import './Swatches.css'

/** One circle of `Swatches`: the `value` it stands for, its fill `colour` in any CSS colour, and the `label` that names it. */
export type Swatch<T extends string = string> = { value: T; colour: string; label: string }

/**
 * The one row of colour circles that picks a colour. Each circle is filled with its `colour` and named
 * by its `label`, which its tooltip shows; the circle of `value` (`''` for none) shows as picked. A click
 * on a circle reports its value through `onPick`, and a click on the picked one reports nothing. On its
 * own it is one Tab stop with the arrow keys inside; inside a toolbar its circles join the toolbar's
 * controls. `label` names the row.
 */
export function Swatches<T extends string>({ label, value, swatches, onPick }: {
  label: string
  value: T | ''
  swatches: readonly Swatch<T>[]
  onPick: (value: T) => void
}) {
  return (
    <ToggleGroup label={label} className="swatches" value={value} onValueChange={(next) => { if (next !== '') onPick(next as T) }}>
      {swatches.map((swatch) => (
        <Tooltip label={swatch.label} key={swatch.value}>
          <ToggleItem
            value={swatch.value} className={swatch.value === value ? 'swatch on' : 'swatch'}
            aria-label={swatch.label} style={{ backgroundColor: swatch.colour }}
          />
        </Tooltip>
      ))}
    </ToggleGroup>
  )
}
