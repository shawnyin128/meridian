import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ignoreComposingEscape } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import { IconButton } from './IconButton.js'
import { IconCross } from './icons.js'
import './ModalDialog.css'

type ContentProps = Omit<Dialog.DialogContentProps,
  'children' | 'className' | 'aria-describedby' | 'onCloseAutoFocus'
>

/** The width steps of the dialog surface: a confirmation, a form, and a wide two-column dialog. */
export type ModalSize = 'confirm' | 'form' | 'wide'

/** The classes of the dialog surface of `size`, with `className` for the layout inside it. */
export function modalSurface(size: ModalSize, className?: string): string {
  return `modal ${size}${className === undefined ? '' : ` ${className}`}`
}

/** The dialog's title, in the one dialog title role; `className` places it, it never restyles it. */
export function ModalTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <Dialog.Title className={`modal-title${className === undefined ? '' : ` ${className}`}`}>{children}</Dialog.Title>
}

/** The close control in a closable dialog's top-right corner. */
function DialogClose({ onClose }: { onClose: () => void }) {
  const m = useMessages()
  return <IconButton label={m.common.dialog.close} className="modal-close" onClick={onClose}><IconCross /></IconButton>
}

/**
 * The app-wide modal skeleton without a trigger. It owns the overlay, the portal, the dialog surface
 * of `size` (centred, capped in height, stacked above whatever opened it), the accessibility
 * declaration for a dialog without a description, and returning focus on close whether the dialog
 * was opened from the app menu, programmatically or by a page button. An Escape pressed while an
 * input method is composing does not close it. `title` heads the surface; a dialog that places its
 * title itself omits it and uses `ModalTitle` in `children`. `children` is the body, which scrolls
 * when it is taller than the window allows, and `actions` stay pinned below it. `closable` puts the
 * dialog's close control in the surface's top-right corner. `className` names the layout inside.
 */
export function ModalDialog({
  open, onOpenChange, size, title, actions, closable = false, className, overlayClassName = 'scrim', children,
  restoreFocus = true, ariaDescribedBy, contentProps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  size: ModalSize
  title?: ReactNode
  actions?: ReactNode
  closable?: boolean
  className?: string
  overlayClassName?: string
  children: ReactNode
  restoreFocus?: boolean
  ariaDescribedBy?: string
  contentProps?: ContentProps
}) {
  const opener = useRef<HTMLElement | null>(null)
  const lastFocused = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  const committedOpen = useRef(open)
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    const remember = (event: FocusEvent) => {
      if (!openRef.current && event.target instanceof HTMLElement && event.target !== document.body) {
        lastFocused.current = event.target
      }
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [])

  // In a controlled Dialog without a Trigger, Radix's close auto-focus is not guaranteed to fire on
  // every close path, so an effect on the committed `open` change does it again, focusing the
  // original opener only while it is still on the page.
  useEffect(() => {
    const previous = committedOpen.current
    committedOpen.current = open
    if (previous && !open && restoreFocus && opener.current?.isConnected) opener.current.focus()
  }, [open, restoreFocus])

  // By the time a controlled Dialog without a Trigger reaches onOpenAutoFocus, FocusScope may have
  // moved focus to the body for a moment. So the closed → open render first remembers the opener
  // still on the page, and closing can reliably return focus to it.
  if (open && !wasOpen.current) {
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body ? active : lastFocused.current
  }
  wasOpen.current = open

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClassName} />
        <Dialog.Content
          {...contentProps}
          className={modalSurface(size, className)}
          {...(ariaDescribedBy === undefined
            ? { 'aria-describedby': undefined }
            : { 'aria-describedby': ariaDescribedBy })}
          onEscapeKeyDown={ignoreComposingEscape((event) => {
            contentProps?.onEscapeKeyDown?.(event)
            // Radix takes Esc in the document's capture phase, before the focused input sees it; an
            // inline draft cancels itself on Esc, so Esc from one leaves the dialog open.
            if (event.target instanceof Element && event.target.matches('[data-inline-draft]')) event.preventDefault()
          })}
          onCloseAutoFocus={(event) => {
            if (!restoreFocus || opener.current === null) return
            event.preventDefault()
            opener.current.focus()
          }}
        >
          {closable ? <DialogClose onClose={() => onOpenChange(false)} /> : null}
          {title === undefined ? null : <ModalTitle>{title}</ModalTitle>}
          <div className="modal-body">{children}</div>
          {actions === undefined ? null : <div className="modal-actions">{actions}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
