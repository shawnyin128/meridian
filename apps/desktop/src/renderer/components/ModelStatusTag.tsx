import { useModelStatus } from '../hooks/useModelStatus.js'
import { useMessages } from '../messages/useMessages.js'
import { useSettingsOpen } from '../shell/AppShell.js'
import { TagButton, type TagState } from './Tag.js'

/**
 * The one "AI not connected" state: while no model is set up, the button in `state` that opens
 * Settings at the model settings; nothing otherwise. Whether one is set up is `connected` when the
 * surface holds Core's own word for the model it will use, as a Harness plan does, and the shell's
 * model status (see useModelStatus) otherwise.
 */
export function ModelStatusTag({ state, connected }: { state?: TagState; connected?: boolean }) {
  const m = useMessages()
  const status = useModelStatus()
  const { openCategory } = useSettingsOpen()
  if ((connected ?? status.connected) !== false) return null
  return <TagButton state={state} onClick={() => openCategory('model')}>{m.common.noModel}</TagButton>
}
