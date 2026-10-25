import { useMessages } from '../messages/useMessages.js'
import { Button, type ButtonSize } from './Button.js'

/**
 * Where a commit sits: `foot`, the foot of a dialog, a popover or a form whose commit is its main
 * action; `heading`, a section's, a group's or a panel's heading; `item`, inside a row or a card.
 */
export type CommitPlace = 'foot' | 'heading' | 'item'

const SIZE: Record<CommitPlace, ButtonSize> = { foot: 'regular', heading: 'compact', item: 'compact' }

/**
 * The one commit of a draft: Cancel, when there is `onCancel`, then Save, at the size of `place`.
 * Save is the primary action at a foot and secondary in a heading or an item. Without `onSave`
 * Save submits the form it sits in, or `form`. `saveLabel` renames Save. While `saving`, both are
 * held and Save shows it is busy, named `busyLabel`; while `canSave` is false Save is held. Each
 * time `done` turns true Save shows the check, named Saved.
 */
export function CommitActions({
  place, onCancel, onSave, form, saveLabel, busyLabel, saving = false, canSave = true, done = false,
}: {
  place: CommitPlace
  onCancel?: () => void
  onSave?: () => void
  form?: string
  saveLabel?: string
  busyLabel?: string
  saving?: boolean
  canSave?: boolean
  done?: boolean
}) {
  const m = useMessages()
  const size = SIZE[place]
  return (
    <>
      {onCancel === undefined ? null : <Button size={size} disabled={saving} onClick={onCancel}>{m.common.cancel}</Button>}
      <Button
        size={size} variant={place === 'foot' ? 'primary' : 'secondary'}
        {...onSave === undefined ? { type: 'submit' as const, form } : { onClick: onSave }}
        disabled={!canSave} busy={saving} busyLabel={busyLabel ?? m.common.saving} done={done} doneLabel={m.common.saved}
      >{saveLabel ?? m.common.save}</Button>
    </>
  )
}
