import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Drafts } from '../hooks/useDrafts.js'
import { useOnLeave } from '../hooks/useOnLeave.js'
import { composing } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import { FormInput } from './FormControls.js'
import './ShortTextEditor.css'

/**
 * Shared body for rename/create popovers. The host chooses DropdownMenu or Popover positioning and
 * leaves closing on an outside press or focus leaving to this component, which owns input height,
 * focus, Enter/Escape, async acceptance, and optional deletion. Leaving saves as Enter does; an
 * empty or unchanged draft just closes. A save made by leaving that `onSubmit` refuses keeps the
 * editor open with its text and marks the input invalid until the text changes. Enter and Escape
 * pressed while an input method is composing belong to it and neither save nor close. `field` is a
 * control for another part of the same object, shown under the text, whose value the host holds;
 * `fieldChanged` says it differs from the saved one, so leaving saves even with the text unchanged.
 * With `kept`, what is typed is kept under `kept.target` in `kept.drafts` as a draft: the editor
 * starts from it the next time it opens, and closing through this editor drops it.
 */
export function ShortTextEditor({
  title, initialValue = '', placeholder, submitLabel, deleteLabel, busyLabel, field, fieldChanged = false,
  onSubmit, onClose, onDelete, onBusyChange, kept,
}: {
  title: string
  initialValue?: string
  placeholder: string
  submitLabel?: string
  deleteLabel?: string
  busyLabel?: string
  field?: ReactNode
  fieldChanged?: boolean
  onSubmit: (value: string) => boolean | Promise<boolean>
  onClose: () => void
  onDelete?: (() => void) | undefined
  onBusyChange?: ((busy: boolean) => void) | undefined
  kept?: { drafts: Drafts<string>; target: string } | undefined
}) {
  const m = useMessages()
  const removeLabel = deleteLabel ?? m.common.delete
  const savingLabel = busyLabel ?? m.common.saving
  const [value, setValue] = useState(kept?.drafts.get(kept.target) ?? initialValue)
  const close = () => {
    kept?.drafts.drop(kept.target)
    onClose()
  }
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const row = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const refused = useRef(false)
  const alive = useRef(true)
  const busyListener = useRef(onBusyChange)
  busyListener.current = onBusyChange

  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  useEffect(() => () => {
    alive.current = false
    if (busyRef.current) busyListener.current?.(false)
  }, [])

  const changeBusy = (next: boolean) => {
    busyRef.current = next
    if (alive.current) setBusy(next)
    busyListener.current?.(next)
  }

  // Same rule as inline editing across the app: until a submit has returned, neither a press outside
  // nor focus leaving sends another, and a refused leave is not retried before the text changes.
  useOnLeave(row, () => {
    if (busyRef.current || refused.current) return
    if (value.trim() === '' || (value.trim() === initialValue && !fieldChanged)) close()
    else void commit(true)
  })

  const commit = async (leaving = false) => {
    const next = value.trim()
    if (next === '' || busyRef.current) return
    changeBusy(true)
    try {
      const accepted = await onSubmit(next)
      // If this editor was replaced for another anchor meanwhile, the old write must not close the new popover.
      if (accepted && alive.current) close()
      else if (!accepted && leaving) {
        refused.current = true
        if (alive.current) setInvalid(true)
      }
    } finally {
      if (alive.current) changeBusy(false)
    }
  }

  return (
    <div
      className="short-text-editor" data-busy={busy ? 'true' : undefined} ref={row}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="short-text-title rh">{title}</div>
      <form
        className="short-text-form mi-in"
        onSubmit={(event) => { event.preventDefault(); void commit() }}
      >
        <FormInput
          ref={input} value={value} placeholder={placeholder} autoComplete="off"
          aria-label={title} aria-invalid={invalid || undefined} disabled={busy}
          onChange={(event) => {
            setValue(event.target.value)
            kept?.drafts.set(kept.target, event.target.value)
            refused.current = false
            setInvalid(false)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') event.stopPropagation()
            if (composing(event.nativeEvent)) return
            if (event.key === 'Enter') { event.preventDefault(); void commit() }
            if (event.key === 'Escape') {
              event.preventDefault()
              if (!busyRef.current) close()
            }
          }}
        />
        {submitLabel === undefined
          ? null
          : <button className="btn pri" disabled={busy || value.trim() === ''}>{busy ? savingLabel : submitLabel}</button>}
      </form>
      {field === undefined ? null : <div className="short-text-field mi-in">{field}</div>}
      {onDelete === undefined
        ? null
        : (
          <>
            <div className="short-text-separator" />
            <button
              type="button" className="short-text-delete mi danger" disabled={busy}
              onClick={() => { onDelete(); onClose() }}
            >{removeLabel}</button>
          </>
        )}
    </div>
  )
}
