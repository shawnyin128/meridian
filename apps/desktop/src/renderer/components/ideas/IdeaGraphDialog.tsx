import { useEffect, useState } from 'react'
import type {
  ResearchGraph, ResearchIdea, ResearchIdeaGraphPlacement,
} from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormInput, FormSelect } from '../FormControls.js'
import { ModalDialog } from '../ModalDialog.js'
import { Tooltip } from '../Tooltip.js'
import './IdeaGraphDialog.css'

export function IdeaGraphDialog({
  open, idea, graph, onOpenChange, onSubmit,
}: {
  open: boolean
  idea: ResearchIdea
  graph: ResearchGraph
  onOpenChange: (open: boolean) => void
  onSubmit: (placement: ResearchIdeaGraphPlacement) => Promise<boolean>
}) {
  const m = useMessages()
  const [label, setLabel] = useState(idea.title)
  const [after, setAfter] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setLabel(idea.title)
    setAfter('')
    setBusy(false)
  }, [idea.title, open])

  const submit = () => {
    if (busy || label.trim() === '') return
    const placement: ResearchIdeaGraphPlacement = { kind: 'create', label: label.trim(), after: after === '' ? null : after }
    setBusy(true)
    void onSubmit(placement).then((saved) => {
      setBusy(false)
      if (saved) onOpenChange(false)
    })
  }

  return (
    <ModalDialog
      open={open} onOpenChange={onOpenChange} size="form" className="idea-graph-dialog"
      title={m.ideas.graphDialog.createTitle}
      actions={(
        <>
          <button className="btn" disabled={busy} onClick={() => onOpenChange(false)}>{m.common.cancel}</button>
          <button
            className="btn pri"
            disabled={busy || label.trim() === ''}
            onClick={submit}
          >{busy ? m.ideas.saving : m.ideas.graphDialog.createAndLink}</button>
        </>
      )}
    >
      <Tooltip label={idea.title} whenClipped><p className="idea-graph-dialog-idea">{idea.title}</p></Tooltip>
      <label className="idea-graph-dialog-field">
        <span>{m.ideas.graphDialog.nodeTitleLabel}</span>
        <FormInput
          appearance="field" autoFocus value={label} maxLength={160}
          onChange={(event) => setLabel(event.target.value)}
        />
      </label>
      <label className="idea-graph-dialog-field">
        <span>{m.ideas.graphDialog.afterLabel}</span>
        <FormSelect
          appearance="field" value={after}
          onChange={(event) => setAfter(event.target.value)}
        >
          <option value="">{m.ideas.graphDialog.newRootOption}</option>
          {graph.nodes.map((node) => (
            <option key={node.id} value={node.id}>{node.label}</option>
          ))}
        </FormSelect>
      </label>
    </ModalDialog>
  )
}
