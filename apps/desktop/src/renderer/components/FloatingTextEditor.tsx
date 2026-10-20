import { useEffect, useRef, useState } from 'react'
import type { Key, ReactElement, ReactNode } from 'react'
import { ActionPopover } from './ActionPopover.js'
import type { ActionPopoverAlign, ActionPopoverSide } from './ActionPopover.js'
import { ShortTextEditor } from './ShortTextEditor.js'

/**
 * A short text editor in a positioned shell. It owns the Popover portal, the anchor, Escape, and
 * the draft state when the edited object switches; an outside press or focus leaving saves or
 * closes through `ShortTextEditor`, never through Radix. Pages only provide the anchor, the copy,
 * the save/delete actions and, when the object has one, `field` and `fieldChanged` as ShortTextEditor
 * takes them. When it closes with focus left nowhere, focus goes back to the element that held it
 * when it opened.
 */
export function FloatingTextEditor({
  open, anchor, editorKey, title, initialValue = '', placeholder, field, fieldChanged = false, onSubmit, onClose, onDelete,
  contentClassName = 'ctxmenu drop', side = 'bottom', align = 'start', sideOffset = 6,
}: {
  open: boolean
  anchor: ReactElement
  editorKey: Key
  title: string
  initialValue?: string
  placeholder: string
  field?: ReactNode
  fieldChanged?: boolean
  onSubmit: (value: string) => boolean | Promise<boolean>
  onClose: () => void
  onDelete?: (() => void) | undefined
  contentClassName?: string
  side?: ActionPopoverSide
  align?: ActionPopoverAlign
  sideOffset?: number
}) {
  const [busy, setBusy] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) {
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null
  }
  wasOpen.current = open

  useEffect(() => {
    if (!open) setBusy(false)
  }, [open, editorKey])

  return (
    <ActionPopover
      open={open} anchor={anchor}
      contentClassName={contentClassName} side={side} align={align} sideOffset={sideOffset}
      contentProps={{
        // Anchored without a trigger, Radix hands focus back to nothing once the popover closes.
        onCloseAutoFocus: (event) => {
          event.preventDefault()
          if (document.activeElement === document.body && opener.current?.isConnected) opener.current.focus()
        },
        onEscapeKeyDown: (event) => {
            // This popover alone decides whether to close, so Radix's open change and the editor's own
            // Escape do not each call onClose; while a write is unfinished, popover and draft stay intact.
          event.preventDefault()
          if (!busy) onClose()
        },
      }}
    >
      <ShortTextEditor
        key={editorKey} title={title} initialValue={initialValue} placeholder={placeholder}
        field={field} fieldChanged={fieldChanged} onSubmit={onSubmit} onClose={onClose} onBusyChange={setBusy}
        {...(onDelete === undefined ? {} : { onDelete })}
      />
    </ActionPopover>
  )
}
