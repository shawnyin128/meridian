import { useMessages } from '../messages/useMessages.js'

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
  if (!editing) return <button type="button" className="btn plain" onClick={onEdit}>{m.common.edit}</button>
  return (
    <>
      <button type="button" className="btn plain" disabled={saving} onClick={onCancel}>{m.common.cancel}</button>
      <button type="button" className="btn plain" disabled={saving || !canSave} onClick={onSave}>{m.common.save}</button>
    </>
  )
}
