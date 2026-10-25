import * as RadixTooltip from '@radix-ui/react-tooltip'
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactElement, ReactNode, SyntheticEvent } from 'react'
import { COLLISION_PADDING } from './floating-layer.js'
import { isClipped } from '../hooks/useClipped.js'
import './Tooltip.css'

/** How long, in ms, the pointer rests on a control before its tooltip opens. */
export const TOOLTIP_DELAY = 500

const Provided = createContext(false)
const Around = createContext(false)

/** The keys that move focus from control to control: Tab, and the arrow keys, Home and End of a toolbar. */
const NAVIGATION_KEYS = new Set(['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])

/** Whether focus arriving now is focus the user moves with a navigation key. */
let navigating = false
let following = false

/**
 * Starts following, once for the page, how focus arrives: from a press of a navigation key until it is
 * let go, focus counts as moved by the user; a press of any other key ends that at once.
 */
function followNavigation() {
  if (following) return
  following = true
  document.addEventListener('keydown', (event) => { navigating = NAVIGATION_KEYS.has(event.key) }, true)
  // A toolbar moves focus on a task its keydown queues, which can run after a quick keyup; a task
  // queued on the keyup runs after it.
  document.addEventListener('keyup', () => { setTimeout(() => { navigating = false }) }, true)
}

/** Whether the caller renders inside the element of a tooltip that has a label. */
export function useInTooltip(): boolean {
  return useContext(Around)
}

/**
 * The one tooltip provider, at the renderer's root: every tooltip under it opens after the same
 * delay, and once one has opened, moving straight on to the next opens that one at once.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  useEffect(followNavigation, [])
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
    return (style.overflowX !== 'visible' && isClipped(box, 'x')) || (style.overflowY !== 'visible' && isClipped(box, 'y'))
  })
}

/**
 * The one tooltip. It names `children`, a single element that takes a ref, with `label`, followed
 * by the `shortcut` of the same action and a secondary `note` line when given; without a `label`
 * it leaves `children` as they are. `whenClipped` opens it only while text inside the element is cut
 * off, to show that text whole. It opens after the shared delay while the pointer rests on the
 * element and at once when Tab, Shift+Tab, an arrow key, Home or End moves focus onto it, never on
 * focus the App moves itself, and closes on press, Escape, blur and when the pointer leaves.
 * Rendered outside a `TooltipProvider`, as a component on its own in a test is, it brings a provider
 * of its own.
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
    <Around.Provider value><RadixTooltip.Root open={open} onOpenChange={setOpen}>
      <RadixTooltip.Trigger
        asChild
        // A menu trigger cancels the press before Radix sees it, so the press closes the tooltip here.
        onPointerDownCapture={() => setOpen(false)}
        onPointerMove={(event) => { if (event.buttons !== 0 || fits(event)) event.preventDefault() }}
        onFocus={(event) => { if (!navigating || fits(event)) event.preventDefault() }}
      >{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="tooltip" side={side} sideOffset={6} collisionPadding={COLLISION_PADDING}>
          {label}
          {shortcut === undefined ? null : <kbd className="tooltip-key">{shortcut}</kbd>}
          {note === undefined ? null : <span className="tooltip-note">{note}</span>}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root></Around.Provider>
  )
  return provided ? tooltip : <TooltipProvider>{tooltip}</TooltipProvider>
}
