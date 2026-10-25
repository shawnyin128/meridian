import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ignoreComposingEscape } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import { useOpenerFocus } from '../hooks/useOpenerFocus.js'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { IconButton } from './IconButton.js'
import { IconCross } from './icons.js'
import { OutsideToolbar } from './Toolbar.js'
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

/**
 * The dialog's title, in the one dialog title role; `className` places it, it never restyles it. A
 * `hidden` title names the dialog for assistive technology only, for a dialog whose field says what it is.
 */
export function ModalTitle({ className, hidden = false, children }: { className?: string; hidden?: boolean; children: ReactNode }) {
  const classes = ['modal-title', hidden ? 'modal-title--hidden' : '', className].filter(Boolean).join(' ')
  return <Dialog.Title className={classes}>{children}</Dialog.Title>
}

/** The close control in a closable dialog's top-right corner. */
function DialogClose({ onClose }: { onClose: () => void }) {
  const m = useMessages()
  return <IconButton label={m.common.dialog.close} className="modal-close" onClick={onClose}><IconCross /></IconButton>
}

/**
 * The app-wide modal skeleton without a trigger. It owns the overlay, the portal, the dialog surface
 * of `size` (centred, capped in height, stacked above whatever opened it), the accessibility
 * declaration for a dialog without a description, and returning focus on close (see useOpenerFocus)
 * whether the dialog was opened from the app menu, programmatically or by a page button. An Escape pressed while an
 * input method is composing does not close it. `title` heads the surface; a dialog that places its
 * title itself omits it and uses `ModalTitle` in `children`. `children` is the body, which scrolls
 * when it is taller than the window allows, and `actions` stay pinned below it. `closable` puts the
 * dialog's close control in the surface's top-right corner, above anything the body holds. `place: 'top'`
 * pins the surface near the window's top instead of centring it, so a field at its top stays put while
 * the list under it grows and shrinks. `className` names the layout inside.
 */
export function ModalDialog({
  open, onOpenChange, size, place = 'center', title, actions, closable = false, className, overlayClassName = 'scrim', children,
  restoreFocus = true, ariaDescribedBy, contentProps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  size: ModalSize
  place?: 'center' | 'top'
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
  const bodyFade = useScrollFade('y')
  const returnFocus = useOpenerFocus(open, restoreFocus)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClassName} />
        <Dialog.Content
          {...contentProps}
          className={modalSurface(size, [place === 'top' ? 'modal--top' : '', className].filter(Boolean).join(' ') || undefined)}
          {...(ariaDescribedBy === undefined
            ? { 'aria-describedby': undefined }
            : { 'aria-describedby': ariaDescribedBy })}
          onEscapeKeyDown={ignoreComposingEscape((event) => {
            contentProps?.onEscapeKeyDown?.(event)
            // Radix takes Esc in the document's capture phase, before the focused input sees it; an
            // inline draft cancels itself on Esc, so Esc from one leaves the dialog open.
            if (event.target instanceof Element && event.target.matches('[data-inline-draft]')) event.preventDefault()
          })}
          onCloseAutoFocus={returnFocus}
        >
          <OutsideToolbar>
            {closable ? <DialogClose onClose={() => onOpenChange(false)} /> : null}
            {title === undefined ? null : <ModalTitle>{title}</ModalTitle>}
            <div className="modal-body" ref={bodyFade}>{children}</div>
            {actions === undefined ? null : <div className="modal-actions">{actions}</div>}
          </OutsideToolbar>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
