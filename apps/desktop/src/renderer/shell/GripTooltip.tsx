import type { ReactElement } from 'react'
import { Tooltip } from '../components/Tooltip.js'
import { appMenu } from '../ipc.js'
import { commandShortcut } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'

/** The tooltip of a resize grip, `children`: a click on the grip collapses its pane, as ⌘B or Ctrl+B does. */
export function GripTooltip({ children }: { children: ReactElement }) {
  const m = useMessages()
  return (
    <Tooltip
      label={m.shell.sidebar.collapseHint} shortcut={commandShortcut(appMenu.platform(), 'B')}
      note={m.shell.sidebar.dragHint} side="right"
    >{children}</Tooltip>
  )
}
