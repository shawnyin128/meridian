import { useModelStatus } from '../hooks/useModelStatus.js'
import { useMessages } from '../messages/useMessages.js'
import { useSettingsOpen } from '../shell/AppShell.js'
import { TagButton, type TagState } from './Tag.js'

/**
 * The one "AI not connected" state: while the shell's model status (see useModelStatus) says no model
 * is set up, the button in `state` that opens Settings at the model settings; nothing otherwise.
 */
export function ModelStatusTag({ state }: { state?: TagState }) {
  const m = useMessages()
  const { connected } = useModelStatus()
  const { openCategory } = useSettingsOpen()
  if (connected !== false) return null
  return <TagButton state={state} onClick={() => openCategory('model')}>{m.common.noModel}</TagButton>
}
