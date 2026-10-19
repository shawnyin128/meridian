import type { ReactElement } from 'react'
import { useMessages } from '../messages/useMessages.js'
import { IconButton } from './IconButton.js'
import { IconCross } from './icons.js'

/** The one control that folds a detail panel away. Screens supply only the callback. */
export function PanelClose({ onClose, className }: {
  onClose: () => void
  className?: string
}): ReactElement {
  const m = useMessages()
  return (
    <IconButton label={m.common.panel.close} className={['panel-close', className].filter(Boolean).join(' ')} onClick={onClose}>
      <IconCross />
    </IconButton>
  )
}
