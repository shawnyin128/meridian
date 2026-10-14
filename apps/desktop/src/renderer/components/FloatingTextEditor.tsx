import { useEffect, useState } from 'react'
import type { Key, ReactElement } from 'react'
import { ActionPopover } from './ActionPopover.js'
import type { ActionPopoverAlign, ActionPopoverSide } from './ActionPopover.js'
import { ShortTextEditor } from './ShortTextEditor.js'

/**
 * A short text editor in a positioned shell. It owns the Popover portal, the anchor, Escape, staying
 * open on an outside press during an async save, and the draft state when the edited object
 * switches; pages only provide the anchor, the copy and the save/delete actions.
 */
export function FloatingTextEditor({
  open, anchor, editorKey, title, initialValue = '', placeholder, onSubmit, onClose, onDelete,
  contentClassName = 'ctxmenu drop', side = 'bottom', align = 'start', sideOffset = 6,
}: {
  open: boolean
  anchor: ReactElement
  editorKey: Key
  title: string
  initialValue?: string
  placeholder: string
  onSubmit: (value: string) => boolean | Promise<boolean>
  onClose: () => void
  onDelete?: (() => void) | undefined
  contentClassName?: string
  side?: ActionPopoverSide
  align?: ActionPopoverAlign
  sideOffset?: number
}) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) setBusy(false)
  }, [open, editorKey])

  return (
    <ActionPopover
      open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }} anchor={anchor}
      contentClassName={contentClassName} side={side} align={align} sideOffset={sideOffset}
      contentProps={{
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
        onSubmit={onSubmit} onClose={onClose} onBusyChange={setBusy}
        {...(onDelete === undefined ? {} : { onDelete })}
      />
    </ActionPopover>
  )
}
