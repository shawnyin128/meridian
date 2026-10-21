import type { DragHandleProps } from '../hooks/useDragReorder.js'
import { IconGrip } from './icons.js'
import './DragHandle.css'

/**
 * The grip a reorderable item is dragged by, drawn as a nested icon button. It is the item's pointer
 * path only, so it takes no focus: the keyboard moves the item with Alt+↑ / Alt+↓ or its ⋯ menu.
 */
export function DragHandle(props: DragHandleProps) {
  return <span className="icbtn sm drag-handle" aria-hidden="true" {...props}><IconGrip /></span>
}
