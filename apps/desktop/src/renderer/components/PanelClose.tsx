import type { ReactElement } from 'react'
import { useMessages } from '../messages/useMessages.js'
import { IconCross } from './icons.js'

/** The one control that folds a detail panel away. Screens supply only the callback. */
export function PanelClose({ onClose, className = '' }: {
  onClose: () => void
  className?: string
}): ReactElement {
  const m = useMessages()
  return (
    <button
      type="button" className={`icbtn panel-close${className ? ` ${className}` : ''}`}
      title={m.common.panel.close} aria-label={m.common.panel.close} onClick={onClose}
    ><IconCross /></button>
  )
}
