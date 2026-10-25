import { useEffect, useState } from 'react'
import type { Key, ReactElement, ReactNode } from 'react'
import type { KeptText } from '../hooks/useDrafts.js'
import { useOpenerFocus } from '../hooks/useOpenerFocus.js'
import { ActionPopover } from './ActionPopover.js'
import type { ActionPopoverAlign, ActionPopoverSide } from './ActionPopover.js'
import { ShortTextEditor } from './ShortTextEditor.js'

/**
 * A short text editor in a positioned shell. It owns the Popover portal, the anchor, Escape, and
 * the draft state when the edited object switches; an outside press or focus leaving saves or
 * closes through `ShortTextEditor`, never through Radix. Pages only provide the anchor, the copy,
 * the save/delete actions and, when the object has one, `field` and `fieldChanged` as ShortTextEditor
 * takes them. Closing returns focus as useOpenerFocus does. `kept` keeps what is typed as a draft;
 * see `ShortTextEditor`.
 */
export function FloatingTextEditor({
  open, anchor, editorKey, title, initialValue = '', placeholder, field, fieldChanged = false, onSubmit, onClose, onDelete,
  side = 'bottom', align = 'start', sideOffset = 6, kept,
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
  side?: ActionPopoverSide
  align?: ActionPopoverAlign
  sideOffset?: number
  kept?: KeptText | undefined
}) {
  const [busy, setBusy] = useState(false)
  const returnFocus = useOpenerFocus(open)

  useEffect(() => {
    if (!open) setBusy(false)
  }, [open, editorKey])

  return (
    <ActionPopover
      open={open} anchor={anchor}
      surface="editor" side={side} align={align} sideOffset={sideOffset}
      contentProps={{
        // Anchored without a trigger, Radix hands focus back to nothing once the popover closes.
        onCloseAutoFocus: returnFocus,
        onEscapeKeyDown: (event) => {
            // This popover alone decides whether to close, so Radix's open change and the editor's own
            // Escape do not each call onClose; while a write is unfinished, popover and draft stay intact.
          event.preventDefault()
          if (busy) return
          kept?.drafts.drop(kept.target)
          onClose()
        },
      }}
    >
      <ShortTextEditor
        key={editorKey} title={title} initialValue={initialValue} placeholder={placeholder}
        field={field} fieldChanged={fieldChanged} onSubmit={onSubmit} onClose={onClose} onBusyChange={setBusy} kept={kept}
        {...(onDelete === undefined ? {} : { onDelete })}
      />
    </ActionPopover>
  )
}
