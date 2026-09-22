import { useEffect } from 'react'
import type { RefObject } from 'react'

/** Use it for rows without entry buttons to avoid having to rehang the listener with a new array every time it is rendered. */
export const NO_TRIGGERS: Array<RefObject<HTMLElement | null>> = []

/**
 * Cancel editing when you click outside the placeholder or the focus leaves the placeholder; Esc does not pass here, and is handled by each placeholder's own onKeyDown. press on
 * Clicking on an element's own scroll bar (not on its content) does not count outside the placeholder.
 * "Within the placeholders" are `row`, `triggers`, and those with `[data-radix-popper-content-wrapper]` ancestors
 * Those contents - Popover, DropdownMenu and other floating layers based on popper positioning, whether they are portaled or not
 * body;Dialog and AlertDialog do not have this attribute and do not count. Although the diamond on the Gantt milestone path is within triggers,
 * Counting as placeholder. `triggers` is the entry button that can reopen or focus this placeholder. There may be more than one. Click them the same
 * Do not count points outside the placeholder.
 * It is canceled when the focus moves from within the placeholder to an element outside the placeholder; it is not canceled when the window is out of focus (switched to another application) and the focus falls back to the body.
 * Elements taken over do not count. When `row` is not mounted, neither is considered.
 */
export function useCancelOnOutside(
  row: RefObject<HTMLElement | null>,
  onCancel: () => void,
  triggers: Array<RefObject<HTMLElement | null>> = NO_TRIGGERS,
) {
  useEffect(() => {
    const inside = (el: Element, held: HTMLElement) => held.contains(el)
      || el.closest('[data-radix-popper-content-wrapper]') !== null
      // The entire Milestone Road is a trigger, but the diamond point on the road opens that own edit line, not reopens this line.
      || (!el.closest('.gddl') && triggers.some((t) => t.current?.contains(el)))
    const press = (e: PointerEvent) => {
      const held = row.current
      const target = e.target as Element
      // The native scroll bar has no independent node, and the target is the scrollable element itself; the vertical scroll bar is really scrolling
      // (scrollHeight > clientHeight), the bar that cannot be measured by clientWidth is occupied. The same is true for horizontal scroll bars.
      // Occupy the one that cannot be measured by clientHeight. When pressed, offsetX/Y will exceed the corresponding client amount.
      const onOwnScrollbar = (target.scrollHeight > target.clientHeight && e.offsetX >= target.clientWidth)
        || (target.scrollWidth > target.clientWidth && e.offsetY >= target.clientHeight)
      if (held !== null && !onOwnScrollbar && !inside(target, held)) onCancel()
    }
    const leave = (e: FocusEvent) => {
      const held = row.current
      // The autoFocus of the placeholder input box is hung up and run before the ref of the row in the layout stage. Every placeholder opened will be
      // After this moment - the row is still empty at that time and cannot be regarded as leaving.
      if (held === null || !(e.relatedTarget instanceof Element)) return
      if (inside(e.target as Element, held) && !inside(e.relatedTarget, held)) onCancel()
    }
    document.addEventListener('pointerdown', press, true)
    document.addEventListener('focusout', leave, true)
    return () => {
      document.removeEventListener('pointerdown', press, true)
      document.removeEventListener('focusout', leave, true)
    }
  }, [row, onCancel, triggers])
}
