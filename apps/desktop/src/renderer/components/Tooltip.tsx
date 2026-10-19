import * as RadixTooltip from '@radix-ui/react-tooltip'
import { createContext, useContext, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
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

/**
 * The one tooltip. It names `children`, a single element that takes a ref, with `label`, followed
 * by the `shortcut` of the same action and a secondary `note` line when given. It opens after the
 * shared delay while the pointer rests on the element and at once when the element takes keyboard
 * focus, and closes on press, Escape, blur and when the pointer leaves. Rendered outside a
 * `TooltipProvider`, as a component on its own in a test is, it brings a provider of its own.
 */
export function Tooltip({ label, shortcut, note, side = 'bottom', children }: {
  label: string
  shortcut?: string | undefined
  note?: string | undefined
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactElement
}) {
  const [open, setOpen] = useState(false)
  const tooltip = (
    <RadixTooltip.Root open={open} onOpenChange={setOpen}>
      <RadixTooltip.Trigger
        asChild
        // A menu trigger cancels the press before Radix sees it, so the press closes the tooltip here.
        onPointerDownCapture={() => setOpen(false)}
        // Focus returned by a closing menu or dialog after a click is not keyboard focus.
        onFocus={(event) => { if (!event.currentTarget.matches(':focus-visible')) event.preventDefault() }}
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
  return useContext(Provided) ? tooltip : <TooltipProvider>{tooltip}</TooltipProvider>
}
