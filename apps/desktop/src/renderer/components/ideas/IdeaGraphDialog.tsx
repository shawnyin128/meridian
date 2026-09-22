import { useEffect, useState } from 'react'
import type {
  ResearchGraph, ResearchIdea, ResearchIdeaGraphPlacement,
} from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { FormInput, FormSelect } from '../FormControls.js'
import { ModalDialog, ModalTitle } from '../ModalDialog.js'
import './IdeaGraphDialog.css'

export type IdeaGraphDialogMode = 'create' | 'link'

export function IdeaGraphDialog({
  open, mode, idea, graph, onOpenChange, onSubmit,
}: {
  open: boolean
  mode: IdeaGraphDialogMode
  idea: ResearchIdea
  graph: ResearchGraph
  onOpenChange: (open: boolean) => void
  onSubmit: (placement: ResearchIdeaGraphPlacement) => Promise<boolean>
}) {
  const m = useMessages()
  const [label, setLabel] = useState(idea.title)
  const [after, setAfter] = useState('')
  const [nodeId, setNodeId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setLabel(idea.title)
    setAfter('')
    const linked = graph.nodes.find((node) => node.id === idea.node)
    setNodeId(linked?.id ?? graph.nodes[0]?.id ?? '')
    setBusy(false)
  }, [graph.nodes, idea.node, idea.title, open])

  const submit = () => {
    if (busy) return
    const placement: ResearchIdeaGraphPlacement = mode === 'create'
      ? { kind: 'create', label: label.trim(), after: after === '' ? null : after }
      : { kind: 'link', nodeId }
    if ((placement.kind === 'create' && placement.label === '')
      || (placement.kind === 'link' && placement.nodeId === '')) return
    setBusy(true)
    void onSubmit(placement).then((saved) => {
      setBusy(false)
      if (saved) onOpenChange(false)
    })
  }

  return (
    <ModalDialog open={open} onOpenChange={onOpenChange} contentClassName="idea-graph-dialog">
      <ModalTitle className="idea-graph-dialog-title">
        {mode === 'create' ? m.ideas.graphDialog.createTitle : m.project.idea.linkExistingNode}
      </ModalTitle>
      <p className="idea-graph-dialog-idea" title={idea.title}>{idea.title}</p>
      {mode === 'create'
        ? (
          <>
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
          </>
        )
        : (
          <label className="idea-graph-dialog-field">
            <span>{m.ideas.graphDialog.nodeLabel}</span>
            <FormSelect
              appearance="field" autoFocus value={nodeId}
              onChange={(event) => setNodeId(event.target.value)}
            >
              {graph.nodes.map((node) => (
                <option key={node.id} value={node.id}>{node.label}</option>
              ))}
            </FormSelect>
          </label>
        )}
      <div className="idea-graph-dialog-actions">
        <button className="btn" disabled={busy} onClick={() => onOpenChange(false)}>{m.common.cancel}</button>
        <button
          className="btn pri"
          disabled={busy || (mode === 'create' ? label.trim() === '' : nodeId === '')}
          onClick={submit}
        >{busy
          ? m.ideas.saving
          : mode === 'create' ? m.ideas.graphDialog.createAndLink : m.ideas.graphDialog.confirmLink}</button>
      </div>
    </ModalDialog>
  )
}
