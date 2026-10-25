import { forwardRef, useEffect, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { IconCheck, RunningRing } from './icons.js'
import { useToolbarItem } from './Toolbar.js'
import './Button.css'

/** `primary` is the solid accent of a screen's one main action, `secondary` a soft fill, `ghost` no fill. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

/**
 * `regular` (30px) in the page header bar and at dialog, popover and form feet; `compact` (24px) in
 * section, group and panel headings, inside rows and cards, and in toolbars.
 */
export type ButtonSize = 'regular' | 'compact'

/** How long a done button shows its check before its label comes back, in milliseconds. */
export const DONE_MS = 1500

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-busy' | 'aria-pressed'> & {
  size: ButtonSize
  variant?: ButtonVariant
  /** `danger` for an action that removes or discards. */
  tone?: 'neutral' | 'danger'
  /** A glyph before the label. */
  icon?: ReactNode
  /** Makes the button a toggle and shows whether it is on. */
  pressed?: boolean
} & ({ busy?: undefined; busyLabel?: never } | { busy: boolean; busyLabel: string })
  & ({ done?: undefined; doneLabel?: never } | { done: boolean; doneLabel: string })

const VARIANT_CLASS: Record<ButtonVariant, string> = { primary: 'pri', secondary: '', ghost: 'ghost' }

/** Whether the check of a button that turned `done` is still showing: from each turn to done until DONE_MS later. */
function useDoneCheck(done: boolean) {
  const [held, setHeld] = useState(done)
  const [showing, setShowing] = useState(done)
  if (held !== done) {
    setHeld(done)
    setShowing(done)
  }
  useEffect(() => {
    if (!showing) return
    const timer = window.setTimeout(() => setShowing(false), DONE_MS)
    return () => window.clearTimeout(timer)
  }, [showing])
  return showing
}

/**
 * The one text button. Further classes in `className` only place it. While `busy` it is disabled and
 * marked `aria-busy`, keeps its width and shows the RunningRing in place of its label, and is named
 * `busyLabel`, which is never shown. Each time `done` turns true it shows the check in place of its
 * label for DONE_MS, named `doneLabel`. Inside a toolbar it is one of the toolbar's controls. Every
 * other attribute goes to the button as given; `type` defaults to `button`.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  size, variant = 'secondary', tone = 'neutral', icon, pressed, busy = false, busyLabel, done = false, doneLabel,
  className, type = 'button', disabled, children, ...props
}, ref) {
  const asItem = useToolbarItem()
  const checked = useDoneCheck(done)
  const classes = ['btn', VARIANT_CLASS[variant], tone === 'danger' ? 'danger' : '', size === 'compact' ? 'sm' : '', className]
    .filter(Boolean).join(' ')
  const label = <>{icon}{children}</>
  const mark = busy ? <RunningRing /> : checked ? <IconCheck /> : null
  return asItem(
    <button
      {...props} ref={ref} type={type} className={classes} disabled={disabled === true || busy}
      aria-busy={busy || undefined} aria-pressed={pressed}
      aria-label={busy ? busyLabel : checked ? doneLabel : props['aria-label']}
    >
      {mark === null ? label : <><span className="btn-label">{label}</span>{mark}</>}
    </button>,
  )
})
