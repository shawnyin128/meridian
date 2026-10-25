import { useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { NO_TRIGGERS, useOnLeave } from '../hooks/useOnLeave.js'
import { appMenu } from '../ipc.js'
import { commitsMultiline, composing } from '../lib/keyboard.js'
import { CommitActions } from './CommitActions.js'
import { Item } from './Item.js'
import './DraftForm.css'

/** Gives a field the refused look while it is `missing` after a save the draft refused; see DraftForm. */
export type DraftInvalid = (missing: boolean) => true | undefined

/**
 * The one form drafted in place: a new item, or a change to one, with its fields where it lands and
 * Cancel and Save at its foot. It opens with its first field focused. Enter in a one-line field, or
 * ⌘Enter on macOS and Ctrl+Enter elsewhere in a long text, saves as Save does; Escape cancels; the keys of an input method
 * composition, and those of a menu opened from a field, are not the draft's. Leaving the draft, by a
 * press outside it or focus moving out of it, neither saves nor cancels, except that it cancels a
 * draft its host calls `empty`; a press on `triggers`, the controls that open the draft, is not
 * leaving (see useOnLeave). `destination` names where the item lands when that is not the draft's own spot,
 * after an arrow, and makes the draft a card of its own. While `canSave` is false, Save is held and a
 * save by key is refused: `children`, and a `destination` that holds a field, then receive an `invalid`
 * that marks each field still `missing`. `onSave` settles once the write does; the host closes the
 * draft when it was written.
 */
export function DraftForm({ destination, canSave, onSave, onCancel, empty = false, triggers = NO_TRIGGERS, className, children }: {
  destination?: ReactNode | ((invalid: DraftInvalid) => ReactNode)
  canSave: boolean
  onSave: () => Promise<unknown>
  onCancel: () => void
  empty?: boolean
  triggers?: Array<RefObject<HTMLElement | null>>
  className?: string
  children: (invalid: DraftInvalid) => ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  // A second Enter in the same frame must already find the save in flight, so this is a ref.
  const busy = useRef(false)
  const [saving, setSaving] = useState(false)
  const [refused, setRefused] = useState(false)
  useOnLeave(root, () => { if (empty) onCancel() }, triggers)

  useLayoutEffect(() => {
    const first = root.current?.querySelector<HTMLElement>('.form-control')
    first?.focus()
    if (first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) {
      first.setSelectionRange(first.value.length, first.value.length)
    }
  }, [])

  const save = () => {
    if (busy.current) return
    if (!canSave) { setRefused(true); return }
    busy.current = true
    setSaving(true)
    void onSave().finally(() => {
      busy.current = false
      setSaving(false)
    })
  }

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { target } = event
    // A field's menu is portaled out of the draft, yet its keys still bubble here through React.
    if (!(target instanceof Node) || root.current?.contains(target) !== true || composing(event.nativeEvent)) return
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
      return
    }
    const commits = target instanceof HTMLTextAreaElement
      ? commitsMultiline(appMenu.platform(), event.nativeEvent)
      : target instanceof HTMLInputElement && event.key === 'Enter'
    if (!commits) return
    event.preventDefault()
    save()
  }

  const invalid: DraftInvalid = (missing) => (refused && missing ? true : undefined)
  const form = (
    <div ref={root} className={`draft-form${className === undefined ? '' : ` ${className}`}`} onKeyDown={keyDown}>
      {destination === undefined
        ? null
        : (
          <div className="draft-form-destination">
            <span aria-hidden="true">→</span>{typeof destination === 'function' ? destination(invalid) : destination}
          </div>
        )}
      {children(invalid)}
      <div className="draft-form-foot">
        <CommitActions place="item" saving={saving} canSave={canSave} onCancel={onCancel} onSave={save} />
      </div>
    </div>
  )
  return destination === undefined ? form : <Item density="card" className="draft-form-card">{form}</Item>
}

/**
 * One line of a DraftForm: `label`, in the draft's label column, names the fields after it, which
 * start where every other line's fields do; a line without a label spans the draft.
 */
export function DraftLine({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="draft-form-line">
      {label === undefined ? null : <span className="draft-form-label">{label}</span>}
      <div className="draft-form-fields">{children}</div>
    </div>
  )
}
