import { useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Item } from './Item.js'

/**
 * Puts the caret back in the draft held by `slot`: in its InlineDraftInput, or else in its first
 * field, after what is typed. Does nothing while no draft is mounted there.
 */
export function focusDraft(slot: HTMLElement | null): void {
  const field = slot?.querySelector<HTMLElement>('[data-inline-draft]') ?? slot?.querySelector<HTMLElement>('.form-control')
  if (field === null || field === undefined) return
  field.focus()
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    field.setSelectionRange(field.value.length, field.value.length)
  }
}

/**
 * The one way a create control, an AddAction, opens the draft of a new item in its place: `start`
 * opens it through `onOpen` while `open` is false, and otherwise puts the caret back in the open
 * draft with what is typed kept. `open` is the draft as `useDraft` or `useDrafts` keeps it, so a draft
 * left open comes back in its place after the App restarts. `slot` goes on the element that holds the
 * draft: a DraftSlot where the item lands, or the container of a draft that adds to a panel.
 */
export function useDraftSlot<T extends HTMLElement = HTMLElement>(open: boolean, onOpen: () => void): {
  slot: RefObject<T | null>
  start: () => void
} {
  const slot = useRef<T>(null)
  return { slot, start: () => { if (open) focusDraft(slot.current); else onOpen() } }
}

/**
 * A new item's draft where the item will land: a row of its list, or a card among its cards or on a
 * card of its own when it lands elsewhere. It is the Item that holds the draft's DraftForm or
 * InlineDraftInput, in `children` or, with the parts the item will show beside it, in `title` after
 * `leading`; `slot` is useDraftSlot's. `className` only names or places it.
 */
export function DraftSlot({ as = 'row', slot, leading, title, className = '', children }: {
  as?: 'row' | 'card'
  slot: RefObject<HTMLElement | null>
  leading?: ReactNode
  title?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <Item
      density={as} className={`draft-slot${className ? ` ${className}` : ''}`} elementRef={slot}
      {...(leading === undefined ? {} : { leading })} {...(title === undefined ? {} : { title })}
    >{children}</Item>
  )
}
