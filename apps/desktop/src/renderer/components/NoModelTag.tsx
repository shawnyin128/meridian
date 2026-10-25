import { useSettingsOpen } from '../shell/AppShell.js'
import { TagButton, type TagState } from './Tag.js'

/** The state a feature shows while no model is set up, `label` in `state`, as the button that opens the model settings. */
export function NoModelTag({ label, state }: { label: string; state?: TagState }) {
  const { openCategory } = useSettingsOpen()
  return <TagButton state={state} onClick={() => openCategory('model')}>{label}</TagButton>
}
