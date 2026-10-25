import { useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { ignoreComposingEscape } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import { Button } from './Button.js'
import { modalSurface } from './ModalDialog.js'

/**
 * One destructive/confirming action shell with shared focus, wording order, and buttons, on the
 * dialog surface's confirmation step. `title` is the short question; `description`, when given, is
 * what is lost for good beyond what the title says, on its own line under it; without it the title
 * alone carries the dialog. `state` is a short state shown beside the buttons, such as
 * what the confirmation costs or why it is disabled. `trigger` opens it; without one, the host opens
 * and closes it through `open` and `onOpenChange`, and closing returns focus to the element that held
 * it when it opened, while that element is still on the page.
 */
export function ConfirmDialog({
  trigger, open, onOpenChange, title, description, state, confirmLabel, cancelLabel,
  confirmTone = 'danger', confirmDisabled = false, onConfirm,
}: ({ trigger: ReactElement; open?: never; onOpenChange?: never }
  | { trigger?: never; open: boolean; onOpenChange: (open: boolean) => void }) & {
  title: ReactNode
  description?: ReactNode
  state?: ReactNode
  confirmLabel?: ReactNode
  cancelLabel?: ReactNode
  confirmTone?: 'danger' | 'primary'
  confirmDisabled?: boolean
  onConfirm: () => void
}) {
  const m = useMessages()
  const confirm = confirmLabel ?? m.common.confirm
  const cancel = cancelLabel ?? m.common.cancel
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  // Radix returns focus only to a trigger, so a dialog without one notes the element focused as it opens.
  if (open === true && !wasOpen.current) {
    const active = document.activeElement
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null
  }
  wasOpen.current = open === true
  return (
    <AlertDialog.Root {...(trigger === undefined ? { open, onOpenChange } : {})}>
      {trigger === undefined ? null : <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="scrim" />
        <AlertDialog.Content
          className={modalSurface('confirm')} onEscapeKeyDown={ignoreComposingEscape()}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
          {...(trigger === undefined ? {
            onCloseAutoFocus: (event: Event) => {
              event.preventDefault()
              if (opener.current?.isConnected) opener.current.focus()
            },
          } : {})}
        >
          <AlertDialog.Title className="modal-title">{title}</AlertDialog.Title>
          {description === undefined ? null : (
            <div className="modal-body">
              <AlertDialog.Description className="modal-detail">{description}</AlertDialog.Description>
            </div>
          )}
          <div className="modal-actions">
            {state === undefined ? null : <span className="modal-actions-state">{state}</span>}
            <AlertDialog.Cancel asChild><Button size="regular">{cancel}</Button></AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                size="regular" variant="primary" tone={confirmTone === 'danger' ? 'danger' : 'neutral'}
                disabled={confirmDisabled} onClick={onConfirm}
              >{confirm}</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
