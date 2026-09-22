import type { ReactElement, ReactNode } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { useMessages } from '../messages/useMessages.js'

/** One destructive/confirming action shell with shared focus, wording order, and buttons. */
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
          className="ctxmenu cfpop"
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <div className="dlg">
            <AlertDialog.Title className="dlg-t">{title}</AlertDialog.Title>
            {description === undefined
              ? null
              : <AlertDialog.Description className="dlg-d">{description}</AlertDialog.Description>}
            <div className="dlg-a">
              <AlertDialog.Cancel className="btn">{cancel}</AlertDialog.Cancel>
              <AlertDialog.Action
                className={confirmTone === 'danger' ? 'btn tdel' : 'btn pri'}
                disabled={confirmDisabled} onClick={onConfirm}
              >{confirm}</AlertDialog.Action>
            </div>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
