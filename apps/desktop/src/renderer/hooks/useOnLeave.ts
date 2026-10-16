import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

/** For drafts without entry buttons: a new array on every render would re-attach the listeners. */
export const NO_TRIGGERS: Array<RefObject<HTMLElement | null>> = []

/**
 * Calls `onLeave` on a press outside the draft or when focus leaves it; the latest `onLeave` is
 * called, so it need not keep its reference across renders. Esc does not go through here; each
 * draft's own onKeyDown handles it. A press on an element's own scrollbar (not its content) does not
 * count as outside.
 * Inside the draft are `row`, `triggers`, and anything with a `[data-radix-popper-content-wrapper]`
 * ancestor: Popover, DropdownMenu and other popper-positioned popovers, whether or not they are
 * portaled to the body, except the popover `row` itself sits in: there only the elements wrapping
 * `row` count, and the rest of that popover is outside. Dialog and AlertDialog lack that attribute
 * and do not count. A diamond on a
 * Gantt milestone lane does not count as inside even though it lies within `triggers`. `triggers`
 * are the entry buttons that can reopen or focus this draft; there may be several, and pressing
 * them does not count as outside either.
 * Focus moving from inside the draft to an element outside it leaves; the window losing focus
 * (switching to another app), where focus falls back to the body and no element receives it, does
 * not. While `row` is not mounted, neither check applies.
 */
export function useOnLeave(
  row: RefObject<HTMLElement | null>,
  onLeave: () => void,
  triggers: Array<RefObject<HTMLElement | null>> = NO_TRIGGERS,
) {
  const latest = useRef(onLeave)
  useLayoutEffect(() => { latest.current = onLeave })
  useEffect(() => {
    const inside = (el: Element, held: HTMLElement) => {
      const layer = el.closest('[data-radix-popper-content-wrapper]')
      // In the popover the draft sits in, only the draft and the boxes wrapping it count as inside.
      const inLayer = layer !== null && (!layer.contains(held) || el.contains(held))
      return held.contains(el) || inLayer
        // The whole milestone lane is a trigger, but a diamond on it opens that milestone's own editor
        // rather than reopening this draft.
        || (!el.closest('.gddl') && triggers.some((t) => t.current?.contains(el)))
    }
    const press = (e: PointerEvent) => {
      const held = row.current
      const target = e.target as Element
      // A native scrollbar has no node of its own, so the target is the scrollable element itself. A
      // vertical scrollbar that actually scrolls (scrollHeight > clientHeight) sits outside
      // clientWidth, and a horizontal one outside clientHeight, so a press on one has an
      // offsetX/offsetY at or beyond the matching client size.
      const onOwnScrollbar = (target.scrollHeight > target.clientHeight && e.offsetX >= target.clientWidth)
        || (target.scrollWidth > target.clientWidth && e.offsetY >= target.clientHeight)
      if (held !== null && !onOwnScrollbar && !inside(target, held)) latest.current()
    }
    const leave = (e: FocusEvent) => {
      const held = row.current
      // The draft input's autoFocus runs as soon as it mounts, before the row's ref is set in the
      // layout phase. Every draft that opens passes this moment with the row still null, and that
      // is not leaving.
      if (held === null || !(e.relatedTarget instanceof Element)) return
      if (inside(e.target as Element, held) && !inside(e.relatedTarget, held)) latest.current()
    }
    document.addEventListener('pointerdown', press, true)
    document.addEventListener('focusout', leave, true)
    return () => {
      document.removeEventListener('pointerdown', press, true)
      document.removeEventListener('focusout', leave, true)
    }
  }, [row, triggers])
}
