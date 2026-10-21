import * as Radix from '@radix-ui/react-context-menu'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from 'react'
import { ignoreComposingEscape } from '../lib/keyboard.js'
import { COLLISION_PADDING } from './floating-layer.js'
import { OutsideToolbar } from './Toolbar.js'

/** How far inside the on-screen top-left corner of the trigger a menu opened from the keyboard appears. */
const KEYBOARD_INSET = 24

/**
 * Opens the trigger's menu at a point inside it, as a right-click there would. A trigger wider than
 * its scroller, such as a table row scrolled sideways, can start off screen, so the point is taken
 * inside the part of it the window shows.
 */
function openFromKeyboard(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
  event.preventDefault()
  const bounds = event.currentTarget.getBoundingClientRect()
  event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true, cancelable: true,
    clientX: Math.max(bounds.left, 0) + KEYBOARD_INSET, clientY: Math.max(bounds.top, 0) + KEYBOARD_INSET,
  }))
}

/**
 * The right-click menu of `trigger`, also opened by the ContextMenu key or Shift+F10 while the
 * trigger holds focus. Radix owns opening at the pointer, the portal, the arrow, Home and End keys
 * with one Tab stop, closing on a press outside or on Escape (not on an Escape pressed while an input
 * method is composing) and returning focus; the menu keeps the shared gap from the window edge.
 * Callers provide the trigger, the label and the items.
 */
export function ContextMenu({ trigger, label, className = '', children }: {
  trigger: ReactElement
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <Radix.Root>
      <Radix.Trigger asChild onKeyDown={openFromKeyboard}>{trigger}</Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          className={`ctxmenu${className ? ` ${className}` : ''}`} aria-label={label}
          collisionPadding={COLLISION_PADDING} onEscapeKeyDown={ignoreComposingEscape()}
        >
          <OutsideToolbar>{children}</OutsideToolbar>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}

export function ContextMenuItem({ className = 'mi', ...props }: Radix.ContextMenuItemProps) {
  return <Radix.Item className={className} {...props} />
}

export function ContextMenuSeparator() {
  return <Radix.Separator className="msep" />
}
