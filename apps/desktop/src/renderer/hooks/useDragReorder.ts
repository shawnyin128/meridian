import { useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'

/** Native drag attributes for one reorderable card, spread directly onto its root element. */
export type DragCardProps = {
  draggable: true
  onDragStart: (event: ReactDragEvent) => void
  onDragEnd: () => void
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void
  onDrop: (event: ReactDragEvent) => void
}

/**
 * Native-HTML5-drag reordering for a flat, already-ordered id list split into scopes (for example
 * a project's status or an idea's archived state): a card can only be dropped among cards of its
 * own scope. `onReorder` receives the full `ids` list with just the dragged scope's ids moved to
 * their new relative order; the caller decides how, and whether, to persist it.
 */
export function useDragReorder(
  ids: readonly string[], scopeOf: (id: string) => string, onReorder: (order: string[]) => void,
): {
  cardProps: (id: string) => DragCardProps
  dropClass: (id: string) => string
} {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; before: boolean } | null>(null)

  const cardProps = (id: string) => ({
    draggable: true as const,
    onDragStart: (event: ReactDragEvent) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', id)
      setDragging(id)
    },
    onDragEnd: () => { setDragging(null); setOver(null) },
    onDragOver: (event: ReactDragEvent<HTMLElement>) => {
      if (dragging === null || dragging === id || scopeOf(dragging) !== scopeOf(id)) return
      event.preventDefault()
      const box = event.currentTarget.getBoundingClientRect()
      setOver({ id, before: event.clientY < box.top + box.height / 2 })
    },
    onDrop: (event: ReactDragEvent) => {
      if (dragging === null || over === null) return
      event.preventDefault()
      const scope = scopeOf(dragging)
      const scoped = ids.filter((candidate) => scopeOf(candidate) === scope)
      const rest = scoped.filter((candidate) => candidate !== dragging)
      const at = rest.indexOf(over.id) + (over.before ? 0 : 1)
      const queue = [...rest.slice(0, at), dragging, ...rest.slice(at)]
      setDragging(null)
      setOver(null)
      onReorder(ids.map((id2) => (scopeOf(id2) === scope ? queue.shift()! : id2)))
    },
  })

  const dropClass = (id: string): string => {
    const parts: string[] = []
    if (dragging === id) parts.push('dragging')
    if (over !== null && over.id === id) parts.push(over.before ? 'drag-over-before' : 'drag-over-after')
    return parts.join(' ')
  }

  return { cardProps, dropClass }
}
