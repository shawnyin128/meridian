import { useMessages } from '../messages/useMessages.js'
import { Button } from './Button.js'
import { CommitActions } from './CommitActions.js'

/**
 * The one edit-and-commit control of a long text edited in place, kept in its heading's action slot:
 * Edit at rest, then Cancel and Save in that same place while editing. `saving` holds both while a
 * save is in flight, and `canSave` holds Save while the draft cannot be saved.
 */
export function EditActions({ editing, onEdit, onCancel, onSave, saving = false, canSave = true }: {
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  saving?: boolean
  canSave?: boolean
}) {
  const m = useMessages()
  if (!editing) return <Button size="compact" onClick={onEdit}>{m.common.edit}</Button>
  return <CommitActions place="heading" saving={saving} canSave={canSave} onCancel={onCancel} onSave={onSave} />
}
