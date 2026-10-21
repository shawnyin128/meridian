import { useSettingsOpen } from '../shell/AppShell.js'
import { TagButton, type TagTone } from './Tag.js'

/** The state a feature shows while no model is set up, `label` in `tone`, as the button that opens the model settings. */
export function NoModelTag({ label, tone }: { label: string; tone?: TagTone }) {
  const { openCategory } = useSettingsOpen()
  return <TagButton tone={tone} onClick={() => openCategory('model')}>{label}</TagButton>
}
