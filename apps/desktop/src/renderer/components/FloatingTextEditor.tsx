import { useEffect, useState } from 'react'
import type { Key, ReactElement } from 'react'
import { ActionPopover } from './ActionPopover.js'
import type { ActionPopoverAlign, ActionPopoverSide } from './ActionPopover.js'
import { ShortTextEditor } from './ShortTextEditor.js'

/**
 * Short text editor with positioned shell. Unify Popover portal, anchor point, Escape, and prohibit closing outside the point during asynchronous saving.
 * And the draft status when the editing object is switched; the page only gives anchors, copywriting and save/delete actions.
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
            // This layer determines whether to close, avoiding Radix's open change and the editor's own Escape.
            // OnClose is called once each; when writing is not completed, the elastic layer and draft are completely retained.
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
