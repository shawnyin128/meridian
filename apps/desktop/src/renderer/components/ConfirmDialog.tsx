import type { ReactElement, ReactNode } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { useOpenerFocus } from '../hooks/useOpenerFocus.js'
import { ignoreComposingEscape } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import { Button } from './Button.js'
import { modalSurface } from './ModalDialog.js'

/**
 * One destructive/confirming action shell with shared focus, wording order, and buttons, on the
 * dialog surface's confirmation step. `title` is the short question; `description` is the
 * consequence, on its own line under it. `state` is a short state shown beside the buttons, such as
 * what the confirmation costs or why it is disabled. `trigger` opens it; without one, the host opens
 * and closes it through `open` and `onOpenChange`, and closing returns focus as useOpenerFocus does.
 */
export function ConfirmDialog({
  trigger, open, onOpenChange, title, description, state, confirmLabel, cancelLabel,
  confirmTone = 'danger', confirmDisabled = false, onConfirm,
}: ({ trigger: ReactElement; open?: never; onOpenChange?: never }
  | { trigger?: never; open: boolean; onOpenChange: (open: boolean) => void }) & {
  title: ReactNode
  description: ReactNode
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
  // Radix returns focus only to a trigger.
  const returnFocus = useOpenerFocus(open === true)
  return (
    <AlertDialog.Root {...(trigger === undefined ? { open, onOpenChange } : {})}>
      {trigger === undefined ? null : <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="scrim" />
        <AlertDialog.Content
          className={modalSurface('confirm')} onEscapeKeyDown={ignoreComposingEscape()}
          {...(trigger === undefined ? { onCloseAutoFocus: returnFocus } : {})}
        >
          <AlertDialog.Title className="modal-title">{title}</AlertDialog.Title>
          <div className="modal-body">
            <AlertDialog.Description className="modal-detail">{description}</AlertDialog.Description>
          </div>
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
