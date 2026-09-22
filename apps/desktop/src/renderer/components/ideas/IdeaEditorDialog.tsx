import { useEffect, useState } from 'react'
import type { ResearchIdea } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormInput, FormTextarea } from '../FormControls.js'
import { ModalDialog, ModalTitle } from '../ModalDialog.js'
import './IdeaEditorDialog.css'

export function IdeaEditorDialog({ open, idea, sourceLabel, onOpenChange, onSubmit }: {
  open: boolean
  idea?: ResearchIdea
  sourceLabel: string
  onOpenChange: (open: boolean) => void
  onSubmit: (title: string, body: string) => Promise<boolean>
}) {
  const m = useMessages()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(idea?.title ?? '')
    setBody(idea?.body ?? '')
    setBusy(false)
  }, [idea, open])

  const save = () => {
    if (busy || title.trim() === '' || body.trim() === '') return
    setBusy(true)
    void onSubmit(title.trim(), body.trim()).then((saved) => {
      setBusy(false)
      if (saved) onOpenChange(false)
    })
  }

  return (
    <ModalDialog open={open} onOpenChange={onOpenChange} contentClassName="idea-dialog">
      <ModalTitle className="idea-dialog-title">
        {idea === undefined ? m.ideas.editor.newTitle : m.ideas.editor.editTitle}
      </ModalTitle>
      <p className="idea-dialog-source">{m.ideas.editor.sourceLabel(sourceLabel)}</p>
      <label className="idea-dialog-field">
        <span>{m.ideas.editor.titleLabel}</span>
        <FormInput
          autoFocus value={title} maxLength={160} placeholder={m.ideas.editor.titlePlaceholder}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="idea-dialog-field">
        <span>{m.ideas.bodyLabel}</span>
        <FormTextarea
          value={body} maxLength={20_000}
          placeholder={m.ideas.editor.bodyPlaceholder}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      <p className="idea-dialog-note">
        {m.ideas.editor.note}
      </p>
      <div className="idea-dialog-actions">
        <button className="btn" disabled={busy} onClick={() => onOpenChange(false)}>{m.common.cancel}</button>
        <button
          className="btn pri" disabled={busy || title.trim() === '' || body.trim() === ''}
          onClick={save}
        >{busy ? m.ideas.saving : m.ideas.editor.save}</button>
      </div>
    </ModalDialog>
  )
}
