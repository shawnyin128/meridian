import type { ReactElement } from 'react'
import { Tooltip } from '../components/Tooltip.js'
import { appMenu } from '../ipc.js'
import { commandShortcut } from '../lib/keyboard.js'

/**
 * The tooltip of a resize grip, `children`: it names `label`, the collapse of the grip's pane that a
 * click on the grip takes, with ⌘B or Ctrl+B, which does the same.
 */
export function GripTooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip label={label} shortcut={commandShortcut(appMenu.platform(), 'B')} side="right">{children}</Tooltip>
  )
}
