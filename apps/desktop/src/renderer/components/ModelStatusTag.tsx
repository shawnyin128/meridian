import { useMessages } from '../messages/useMessages.js'
import { useSettingsOpen } from '../shell/AppShell.js'
import { TagButton, type TagState } from './Tag.js'

/**
 * The one "AI not connected" state: while the model a surface runs cannot run (`connected` false),
 * the button in `state` that opens Settings at the model settings; nothing otherwise.
 */
export function ModelStatusTag({ state, connected }: { state?: TagState; connected: boolean }) {
  const m = useMessages()
  const { openCategory } = useSettingsOpen()
  if (connected) return null
  return <TagButton state={state} onClick={() => openCategory('model')}>{m.common.noModel}</TagButton>
}
