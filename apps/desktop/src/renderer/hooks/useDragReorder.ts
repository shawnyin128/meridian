import { useRef } from 'react'
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { typesText } from '../lib/keyboard.js'

/** The direction items are laid out in: `y` a column of rows or cards, `x` a run of chips or table columns. */
export type ReorderAxis = 'x' | 'y'

/** Where a drag starts: `grip`, the item's DragHandle; `row`, anywhere on the item. */
export type ReorderHandle = 'grip' | 'row'

/** Native drag attributes of an item's drag handle, the only part of the item a drag starts from. */
export type DragHandleProps = {
  draggable: true
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void
  onDragEnd: () => void
}

/**
 * Attributes of one reorderable item: it takes drops, and Alt with the arrows of its axis moves it.
 * With `handle: 'row'` they also carry the drag handle's attributes.
 */
export type ReorderItemProps = {
  'data-reorder-item': string
  'data-reorder-axis': ReorderAxis
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void
  onDrop: (event: ReactDragEvent) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
} & Partial<DragHandleProps>

/** What a reorderable item component takes: its own attributes and its drag handle's. */
export type Reorderable = { item: ReorderItemProps; handle: DragHandleProps }

/** The keys that move an item one place back and forward along each axis, with Alt held. */
const KEYS: Record<ReorderAxis, Record<string, -1 | 1>> = {
  x: { ArrowLeft: -1, ArrowRight: 1 },
  y: { ArrowUp: -1, ArrowDown: 1 },
}

/**
 * Reordering for a flat, already-ordered id list split into scopes (for example a project's status
 * or an idea's archived state): an item only moves among items of its own scope. A drag starts on the
 * item's handle and drops on another item (`itemProps`). With `handle: 'grip'` the handle is the
 * item's DragHandle, which takes `handleProps`; with `handle: 'row'` the whole item is the handle and
 * `itemProps` carry its attributes. `axis` says which half of the item under the pointer puts the held
 * item before it, and which arrows move an item with Alt: ← / → on `x`, ↑ / ↓ on `y`. `move` shifts an
 * item one place, which the ⋯ menus and the Alt arrows use, and `canMove` says whether it can go that
 * way. `onReorder` receives the full `ids` list with just the moved scope's ids in their new relative
 * order, and the id that moved; the caller decides how, and whether, to persist it.
 * While a drag lasts, the held item has the class `dragging` and the item under the pointer
 * `drag-over-before` or `drag-over-after`, set on their elements without rendering the caller; with
 * `data-reorder-axis` they are the whole drag state the drop look is drawn from.
 */
export function useDragReorder(
  ids: readonly string[], scopeOf: (id: string) => string, onReorder: (order: string[], moved: string) => void,
  { axis, handle }: { axis: ReorderAxis; handle: ReorderHandle },
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
    onReorder(ids.map((other) => (scopeOf(other) === scope ? queue.shift()! : other)), id)
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
    'data-reorder-axis': axis,
    ...(handle === 'row' ? handleProps(id) : {}),
    onDragOver: (event) => {
      const held = drag.current
      if (held === null || held.id === id || scopeOf(held.id) !== scopeOf(id)) return
      event.preventDefault()
      const item = event.currentTarget
      const box = item.getBoundingClientRect()
      const before = axis === 'x' ? event.clientX < box.left + box.width / 2 : event.clientY < box.top + box.height / 2
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
      const by = KEYS[axis][event.key]
      if (by === undefined || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || typesText(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      move(id, by)
    },
  })

  return { handleProps, itemProps, canMove, move }
}
