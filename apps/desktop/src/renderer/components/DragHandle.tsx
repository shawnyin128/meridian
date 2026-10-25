import type { MouseEventHandler } from 'react'
import type { DragHandleProps } from '../hooks/useDragReorder.js'
import { IconGrip } from './icons.js'
import './DragHandle.css'

/**
 * The grip a reorderable item is dragged by, drawn as a nested icon button. It is the item's pointer
 * path only, so it takes no focus: the keyboard moves the item with Alt and the arrows of its axis, or
 * its ⋯ menu. `size` follows IconButton: `nested` in a row's actions, `inline` before a table header's
 * label, where it shows only while its item is hovered or holds focus. `onClick` and `onMouseDown`
 * let an item that acts on a click, such as a sortable header, keep a press on the grip to itself.
 */
export function DragHandle({ size = 'nested', ...props }: DragHandleProps & {
  size?: 'nested' | 'inline'
  onClick?: MouseEventHandler<HTMLElement>
  onMouseDown?: MouseEventHandler<HTMLElement>
}) {
  return <span className={`icbtn ${size === 'inline' ? 'xs' : 'sm'} drag-handle`} aria-hidden="true" {...props}><IconGrip /></span>
}
