import { useModelStatus } from '../hooks/useModelStatus.js'
import { useMessages } from '../messages/useMessages.js'
import { useSettingsOpen } from '../shell/AppShell.js'
import { TagButton, type TagTone } from './Tag.js'

/**
 * The one "AI not connected" state: while the shell's model status (see useModelStatus) says no model
 * is set up, the button in `tone` that opens Settings at the model settings; nothing otherwise.
 */
export function ModelStatusTag({ tone }: { tone?: TagTone }) {
  const m = useMessages()
  const { connected } = useModelStatus()
  const { openCategory } = useSettingsOpen()
  if (connected !== false) return null
  return <TagButton tone={tone} onClick={() => openCategory('model')}>{m.common.noModel}</TagButton>
}
