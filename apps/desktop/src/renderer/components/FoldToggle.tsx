import { useId } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { FoldCaret } from './FoldCaret.js'
import { IconButton } from './IconButton.js'
import { useToolbarItem } from './Toolbar.js'
import { Tooltip } from './Tooltip.js'
import './FoldToggle.css'

type FoldToggleProps = {
  /** Whether the folded content shows. */
  open: boolean
  onToggle: () => void
  /** The id of the element that holds the folded content. */
  controls?: string
  /** Classes for the button, which only place it or give its label a look. */
  className?: string
} & (
  | { variant?: 'label'; children: ReactNode; label?: string | undefined }
  | { variant: 'composite'; children: ReactNode; label?: never }
  | { variant: 'caret'; label: string; children?: never }
) & { [key: `data-${string}`]: string }

/**
 * The one control that folds content away and back: a button that leads with the fold caret, then
 * its label, and states whether the content shows and which element holds it. In the `label`
 * variant `children` is the label inside the button; `label`, when given, names the button instead
 * and shows as its tooltip. A `composite` label holds controls of its own, such as an entity link:
 * the button lies over the caret and the label, which names it, and those controls sit above it.
 * The `caret` variant is the caret alone, an inline icon button named by `label`, for a row whose
 * label is a control of its own. A click toggles and never reaches the row around the toggle; inside
 * a toolbar the button is one of the toolbar's controls.
 */
export function FoldToggle({ open, onToggle, controls, className, variant, children, label, ...data }: FoldToggleProps) {
  const asItem = useToolbarItem()
  const labelId = useId()
  const press = (event: MouseEvent) => {
    event.stopPropagation()
    onToggle()
  }
  const classes = (own: string) => (className === undefined ? own : `${own} ${className}`)
  const caret = <FoldCaret open={open} />
  if (variant === 'caret') {
    return (
      <IconButton
        {...data} label={label} size="inline" className={classes('fold-toggle')}
        aria-expanded={open} aria-controls={controls} onClick={press}
      >{caret}</IconButton>
    )
  }
  if (variant === 'composite') {
    return (
      <div {...data} className="fold-toggle fold-toggle--composite">
        {asItem(
          <button
            type="button" className={classes('fold-toggle-press')} aria-expanded={open} aria-controls={controls}
            aria-labelledby={labelId} onClick={press}
          />,
        )}
        {caret}
        <span className="fold-toggle-label" id={labelId}>{children}</span>
      </div>
    )
  }
  return (
    <Tooltip label={label}>
      {asItem(
        <button
          {...data} type="button" className={classes('fold-toggle')} aria-expanded={open} aria-controls={controls}
          aria-label={label} onClick={press}
        >{caret}{children}</button>,
      )}
    </Tooltip>
  )
}
