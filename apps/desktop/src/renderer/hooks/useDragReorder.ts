import { useRef } from 'react'
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'

/** Native drag attributes of an item's drag handle, the only part of the item a drag starts from. */
export type DragHandleProps = {
  draggable: true
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void
  onDragEnd: () => void
}

/** Attributes of one reorderable item: it takes drops, and Alt+↑ / Alt+↓ inside it move it. */
export type ReorderItemProps = {
  'data-reorder-item': string
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void
  onDrop: (event: ReactDragEvent) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
}

/** What a reorderable item component takes: its own attributes and its drag handle's. */
export type Reorderable = { item: ReorderItemProps; handle: DragHandleProps }

/** Typing targets keep Alt+Arrow for themselves: it moves the caret there. */
const editable = (target: EventTarget) => target instanceof HTMLElement
  && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/**
 * Reordering for a flat, already-ordered id list split into scopes (for example a project's status
 * or an idea's archived state): an item only moves among items of its own scope. A drag starts on the
 * item's handle (`handleProps`), which sits inside the item or is the item, and drops on another item
 * (`itemProps`); `move` shifts an item one place, which the ⋯ menus and Alt+↑ / Alt+↓ use, and
 * `canMove` says whether it can go that way. `onReorder` receives the full `ids` list with just the
 * moved scope's ids in their new relative order; the caller decides how, and whether, to persist it.
 * While a drag lasts, the held item has the class `dragging` and the item under the pointer
 * `drag-over-before` or `drag-over-after`, set on their elements without rendering the caller.
 */
export function useDragReorder(
  ids: readonly string[], scopeOf: (id: string) => string, onReorder: (order: string[]) => void,
): {
  handleProps: (id: string) => DragHandleProps
  itemProps: (id: string) => ReorderItemProps
  canMove: (id: string, by: -1 | 1) => boolean
  move: (id: string, by: -1 | 1) => void
} {
  // Kept out of React state: rendering the caller on every dragover would redraw its whole list.
  const drag = useRef<{
    id: string; item: HTMLElement; over: { id: string; before: boolean; item: HTMLElement } | null
  } | null>(null)
  const lineClass = (before: boolean) => (before ? 'drag-over-before' : 'drag-over-after')
  /** Ends the drag in progress and clears its marks. */
  const finish = () => {
    const held = drag.current
    if (held === null) return
    held.item.classList.remove('dragging')
    held.over?.item.classList.remove(lineClass(held.over.before))
    drag.current = null
  }

  /** Puts `id` into `queue`, its scope's ids without it, and reports the full new order. */
  const place = (id: string, queue: string[]) => {
    const scope = scopeOf(id)
    onReorder(ids.map((other) => (scopeOf(other) === scope ? queue.shift()! : other)))
  }
  const scoped = (id: string) => ids.filter((other) => scopeOf(other) === scopeOf(id))
  const canMove = (id: string, by: -1 | 1) => {
    const peers = scoped(id)
    const to = peers.indexOf(id) + by
    return to >= 0 && to < peers.length
  }
  const move = (id: string, by: -1 | 1) => {
    if (!canMove(id, by)) return
    const peers = scoped(id)
    const at = peers.indexOf(id)
    const queue = peers.filter((other) => other !== id)
    queue.splice(at + by, 0, id)
    place(id, queue)
  }

  const handleProps = (id: string): DragHandleProps => ({
    draggable: true,
    onDragStart: (event) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', id)
      // The whole item, not just the handle, follows the pointer.
      const item = event.currentTarget.closest<HTMLElement>('[data-reorder-item]')!
      if (item !== event.currentTarget) {
        const box = item.getBoundingClientRect()
        event.dataTransfer.setDragImage(item, event.clientX - box.left, event.clientY - box.top)
      }
      finish()
      item.classList.add('dragging')
      drag.current = { id, item, over: null }
    },
    onDragEnd: finish,
  })

  const itemProps = (id: string): ReorderItemProps => ({
    'data-reorder-item': id,
    onDragOver: (event) => {
      const held = drag.current
      if (held === null || held.id === id || scopeOf(held.id) !== scopeOf(id)) return
      event.preventDefault()
      const item = event.currentTarget
      const box = item.getBoundingClientRect()
      const before = event.clientY < box.top + box.height / 2
      const last = held.over
      if (last !== null && (last.item !== item || last.before !== before)) last.item.classList.remove(lineClass(last.before))
      // Both marks are set again on every dragover: a render that changes an item's className drops them.
      held.item.classList.add('dragging')
      item.classList.add(lineClass(before))
      held.over = { id, before, item }
    },
    onDrop: (event) => {
      const held = drag.current
      if (held === null || held.over === null) return
      event.preventDefault()
      const { id: dragging, over } = held
      const queue = scoped(dragging).filter((other) => other !== dragging)
      queue.splice(queue.indexOf(over.id) + (over.before ? 0 : 1), 0, dragging)
      finish()
      place(dragging, queue)
    },
    onKeyDown: (event) => {
      const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
      if (by === 0 || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || editable(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      move(id, by)
    },
  })

  return { handleProps, itemProps, canMove, move }
}
