import * as RadixTooltip from '@radix-ui/react-tooltip'
import { createContext, useContext, useState } from 'react'
import type { ReactElement, ReactNode, SyntheticEvent } from 'react'
import { COLLISION_PADDING } from './floating-layer.js'
import './Tooltip.css'

/** How long, in ms, the pointer rests on a control before its tooltip opens. */
export const TOOLTIP_DELAY = 500

const Provided = createContext(false)

/**
 * The one tooltip provider, at the renderer's root: every tooltip under it opens after the same
 * delay, and once one has opened, moving straight on to the next opens that one at once.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Provided.Provider value>
      <RadixTooltip.Provider delayDuration={TOOLTIP_DELAY}>{children}</RadixTooltip.Provider>
    </Provided.Provider>
  )
}

/** Whether some text inside `element`, the element included, is cut off by the box that holds it. */
function clipped(element: HTMLElement): boolean {
  return [element, ...element.querySelectorAll<HTMLElement>('*')].some((box) => {
    const style = getComputedStyle(box)
    return (style.overflowX !== 'visible' && box.scrollWidth > box.clientWidth + 1)
      || (style.overflowY !== 'visible' && box.scrollHeight > box.clientHeight + 1)
  })
}

/**
 * The one tooltip. It names `children`, a single element that takes a ref, with `label`, followed
 * by the `shortcut` of the same action and a secondary `note` line when given; without a `label`
 * it leaves `children` as they are. `whenClipped` opens it only while text inside the element is cut
 * off, to show that text whole. It opens after the shared delay while the pointer rests on the
 * element and at once when the element takes keyboard focus, and closes on press, Escape, blur and
 * when the pointer leaves. Rendered outside a `TooltipProvider`, as a component on its own in a test
 * is, it brings a provider of its own.
 */
export function Tooltip({ label, shortcut, note, whenClipped = false, side = 'bottom', children }: {
  label: string | undefined
  shortcut?: string | undefined
  note?: string | undefined
  whenClipped?: boolean
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactElement
}) {
  const [open, setOpen] = useState(false)
  const provided = useContext(Provided)
  if (label === undefined) return children
  // A default-prevented pointer move or focus never reaches Radix: a text that fits opens nothing, and
  // nothing opens while a button is held, as during a drag.
  const fits = (event: SyntheticEvent<HTMLElement>) => whenClipped && !clipped(event.currentTarget)
  const tooltip = (
    <RadixTooltip.Root open={open} onOpenChange={setOpen}>
      <RadixTooltip.Trigger
        asChild
        // A menu trigger cancels the press before Radix sees it, so the press closes the tooltip here.
        onPointerDownCapture={() => setOpen(false)}
        onPointerMove={(event) => { if (event.buttons !== 0 || fits(event)) event.preventDefault() }}
        // Focus returned by a closing menu or dialog after a click is not keyboard focus.
        onFocus={(event) => { if (!event.currentTarget.matches(':focus-visible') || fits(event)) event.preventDefault() }}
      >{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="tooltip" side={side} sideOffset={6} collisionPadding={COLLISION_PADDING}>
          {label}
          {shortcut === undefined ? null : <kbd className="tooltip-key">{shortcut}</kbd>}
          {note === undefined ? null : <span className="tooltip-note">{note}</span>}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
  return provided ? tooltip : <TooltipProvider>{tooltip}</TooltipProvider>
}
