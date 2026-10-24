import { useState } from 'react'
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { typesText } from '../lib/keyboard.js'

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

/**
 * Reordering for a flat, already-ordered id list split into scopes (for example a project's status
 * or an idea's archived state): an item only moves among items of its own scope. A drag starts on the
 * item's handle (`handleProps`) and drops on another item (`itemProps`); `move` shifts an item one
 * place, which the ⋯ menus and Alt+↑ / Alt+↓ use, and `canMove` says whether it can go that way.
 * `onReorder` receives the full `ids` list with just the moved scope's ids in their new relative
 * order; the caller decides how, and whether, to persist it.
 */
export function useDragReorder(
  ids: readonly string[], scopeOf: (id: string) => string, onReorder: (order: string[]) => void,
): {
  handleProps: (id: string) => DragHandleProps
  itemProps: (id: string) => ReorderItemProps
  dropClass: (id: string) => string
  canMove: (id: string, by: -1 | 1) => boolean
  move: (id: string, by: -1 | 1) => void
} {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; before: boolean } | null>(null)

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
      const item = event.currentTarget.closest<HTMLElement>('[data-reorder-item]')
      if (item !== null && item !== event.currentTarget) {
        const box = item.getBoundingClientRect()
        event.dataTransfer.setDragImage(item, event.clientX - box.left, event.clientY - box.top)
      }
      setDragging(id)
    },
    onDragEnd: () => { setDragging(null); setOver(null) },
  })

  const itemProps = (id: string): ReorderItemProps => ({
    'data-reorder-item': id,
    onDragOver: (event) => {
      if (dragging === null || dragging === id || scopeOf(dragging) !== scopeOf(id)) return
      event.preventDefault()
      const box = event.currentTarget.getBoundingClientRect()
      setOver({ id, before: event.clientY < box.top + box.height / 2 })
    },
    onDrop: (event) => {
      if (dragging === null || over === null) return
      event.preventDefault()
      const queue = scoped(dragging).filter((other) => other !== dragging)
      queue.splice(queue.indexOf(over.id) + (over.before ? 0 : 1), 0, dragging)
      setDragging(null)
      setOver(null)
      place(dragging, queue)
    },
    onKeyDown: (event) => {
      const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
      if (by === 0 || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || typesText(event.target)) return
      event.preventDefault()
      event.stopPropagation()
      move(id, by)
    },
  })

  const dropClass = (id: string): string => {
    const parts: string[] = []
    if (dragging === id) parts.push('dragging')
    if (over !== null && over.id === id) parts.push(over.before ? 'drag-over-before' : 'drag-over-after')
    return parts.join(' ')
  }

  return { handleProps, itemProps, dropClass, canMove, move }
}
