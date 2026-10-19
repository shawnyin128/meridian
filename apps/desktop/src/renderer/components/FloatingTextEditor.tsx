import { useEffect, useState } from 'react'
import type { Key, ReactElement } from 'react'
import { composing } from '../lib/keyboard.js'
import { ActionPopover } from './ActionPopover.js'
import type { ActionPopoverAlign, ActionPopoverSide } from './ActionPopover.js'
import { ShortTextEditor } from './ShortTextEditor.js'

/**
 * A short text editor in a positioned shell. It owns the Popover portal, the anchor, Escape, and
 * the draft state when the edited object switches; an outside press or focus leaving saves or
 * closes through `ShortTextEditor`, never through Radix. Pages only provide the anchor, the copy and
 * the save/delete actions.
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
      open={open} anchor={anchor}
      contentClassName={contentClassName} side={side} align={align} sideOffset={sideOffset}
      contentProps={{
        onEscapeKeyDown: (event) => {
            // This popover alone decides whether to close, so Radix's open change and the editor's own
            // Escape do not each call onClose; while a write is unfinished, popover and draft stay intact.
          event.preventDefault()
          if (!busy && !composing(event)) onClose()
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
