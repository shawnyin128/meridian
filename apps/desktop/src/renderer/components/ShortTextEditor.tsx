import { useCallback, useEffect, useRef, useState } from 'react'
import { useCancelOnOutside } from '../hooks/useCancelOnOutside.js'
import { useMessages } from '../messages/useMessages.js'
import { FormInput } from './FormControls.js'
import './ShortTextEditor.css'

/**
 * Shared body for rename/create popovers. The host chooses DropdownMenu or Popover positioning;
 * this component owns input height, focus, Enter/Escape, async acceptance, and optional deletion.
 */
export function ShortTextEditor({
  title, initialValue = '', placeholder, submitLabel, deleteLabel, busyLabel,
  onSubmit, onClose, onDelete, onBusyChange,
}: {
  title: string
  initialValue?: string
  placeholder: string
  submitLabel?: string
  deleteLabel?: string
  busyLabel?: string
  onSubmit: (value: string) => boolean | Promise<boolean>
  onClose: () => void
  onDelete?: (() => void) | undefined
  onBusyChange?: ((busy: boolean) => void) | undefined
}) {
  const m = useMessages()
  const removeLabel = deleteLabel ?? m.common.delete
  const savingLabel = busyLabel ?? m.common.saving
  const [value, setValue] = useState(initialValue)
  const [busy, setBusy] = useState(false)
  const row = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
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

  // The same convention as for in-place editing across the entire application: drafts cannot be discarded by out-of-point and focus-away before submission has been returned.
  const cancelUnlessBusy = useCallback(() => {
    if (!busyRef.current) onClose()
  }, [onClose])
  useCancelOnOutside(row, cancelUnlessBusy)

  const commit = async () => {
    const next = value.trim()
    if (next === '' || busyRef.current) return
    changeBusy(true)
    try {
      // If this editor has been replaced by another anchor point, the new pop-up layer cannot be closed even if the old one is written successfully.
      if (await onSubmit(next) && alive.current) onClose()
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
          aria-label={title} disabled={busy}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') event.stopPropagation()
            if (event.key === 'Enter') { event.preventDefault(); void commit() }
            if (event.key === 'Escape') {
              event.preventDefault()
              if (!busyRef.current) onClose()
            }
          }}
        />
        {submitLabel === undefined
          ? null
          : <button className="btn pri" disabled={busy || value.trim() === ''}>{busy ? savingLabel : submitLabel}</button>}
      </form>
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
