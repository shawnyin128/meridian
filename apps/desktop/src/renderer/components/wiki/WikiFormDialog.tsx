import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useMessages } from '../../messages/useMessages.js'
import { ModalDialog, ModalTitle } from '../ModalDialog.js'
import './WikiFormDialog.css'

/**
 * The one dialog every Wiki claim form opens in: a title, the form's fields, and cancel / save. Save is
 * enabled while `canSubmit` holds; it calls `onSubmit` and closes when that resolves true.
 */
export function WikiFormDialog({ open, title, canSubmit, onOpenChange, onSubmit, children }: {
  open: boolean
  title: string
  canSubmit: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: () => Promise<boolean>
  children: ReactNode
}) {
  const m = useMessages()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setBusy(false)
  }, [open])

  const save = () => {
    if (busy || !canSubmit) return
    setBusy(true)
    void onSubmit().then((saved) => {
      setBusy(false)
      if (saved) onOpenChange(false)
    })
  }

  return (
    <ModalDialog open={open} onOpenChange={onOpenChange} contentClassName="wiki-form">
      <ModalTitle className="wiki-form-title">{title}</ModalTitle>
      {children}
      <div className="wiki-form-actions">
        <button className="btn" disabled={busy} onClick={() => onOpenChange(false)}>{m.common.cancel}</button>
        <button className="btn pri" disabled={busy || !canSubmit} onClick={save}>
          {busy ? m.wiki.claims.form.saving : m.wiki.claims.form.save}
        </button>
      </div>
    </ModalDialog>
  )
}

/** One labelled field of a WikiFormDialog. */
export function WikiFormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="wiki-form-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
