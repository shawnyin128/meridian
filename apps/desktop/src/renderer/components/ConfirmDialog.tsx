import type { ReactElement, ReactNode } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { ignoreComposingEscape } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import { modalSurface } from './ModalDialog.js'

/**
 * One destructive/confirming action shell with shared focus, wording order, and buttons, on the
 * dialog surface's confirmation step.
 */
export function ConfirmDialog({
  trigger, title, description, confirmLabel, cancelLabel,
  confirmTone = 'danger', confirmDisabled = false, onConfirm,
}: {
  trigger: ReactElement
  title: ReactNode
  description?: ReactNode
  confirmLabel?: ReactNode
  cancelLabel?: ReactNode
  confirmTone?: 'danger' | 'primary'
  confirmDisabled?: boolean
  onConfirm: () => void
}) {
  const m = useMessages()
  const confirm = confirmLabel ?? m.common.confirm
  const cancel = cancelLabel ?? m.common.cancel
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="scrim" />
        <AlertDialog.Content
          className={modalSurface('confirm')} onEscapeKeyDown={ignoreComposingEscape()}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <AlertDialog.Title className="modal-title">{title}</AlertDialog.Title>
          {description === undefined
            ? null
            : (
              <div className="modal-body">
                <AlertDialog.Description className="modal-detail">{description}</AlertDialog.Description>
              </div>
            )}
          <div className="modal-actions">
            <AlertDialog.Cancel className="btn">{cancel}</AlertDialog.Cancel>
            <AlertDialog.Action
              className={confirmTone === 'danger' ? 'btn tdel' : 'btn pri'}
              disabled={confirmDisabled} onClick={onConfirm}
            >{confirm}</AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
