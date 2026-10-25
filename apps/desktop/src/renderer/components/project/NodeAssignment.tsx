import type { ReactNode } from 'react'
import type { GraphNode } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { EmptyState } from '../EmptyState.js'
import { ChoicePicker } from '../FieldPickers.js'
import { SectionHeading } from '../PageShell.js'
import { EntityLink } from '../EntityLink.js'
import { Button } from '../Button.js'
import './NodeAssignment.css'

/**
 * The research-node section of a detail panel. Its heading holds the one control that assigns a node:
 * picking one of `nodes` links it or changes it, and with `canUnlink` the link can be taken away.
 * `create` joins the heading while no node is linked, and `draft`, the node it drafts, stands below the
 * heading where the linked node will show. Below the heading, the linked node opens through `onOpen`.
 */
export function NodeAssignment({ node, nodes, canUnlink, create, draft, onOpen, onSet }: {
  node: { id: string; label: string; mode: NonNullable<GraphNode['mode']> } | undefined
  nodes: readonly { id: string; label: string }[]
  canUnlink: boolean
  create?: ReactNode
  draft?: ReactNode
  onOpen: (nodeId: string) => void
  onSet: (nodeId: string | null) => void
}) {
  const m = useMessages()
  const pick = (text: string) => (
    <ChoicePicker
      value={node?.id ?? ''} options={nodes.map((candidate) => candidate.id)} appearance="button"
      label={(id) => nodes.find((candidate) => candidate.id === id)?.label ?? id} onPick={onSet}
    >{text}</ChoicePicker>
  )
  const actions = node === undefined
    ? (nodes.length === 0 && create === undefined ? undefined : <>{create}{nodes.length === 0 ? null : pick(m.project.plan.linkNode)}</>)
    : (
      <>
        {pick(m.project.plan.changeNode)}
        {canUnlink ? <Button size="regular" onClick={() => onSet(null)}>{m.project.plan.unlinkNode}</Button> : null}
      </>
    )
  return (
    <>
      <SectionHeading variant="rail" actions={actions}>{m.project.plan.nodeHeading}</SectionHeading>
      {node === undefined
        ? draft ?? <EmptyState variant="section">{m.project.plan.noNode}</EmptyState>
        : (
          <div className="node-assignment">
            <EntityLink kind="node" label={node.label} mode={node.mode} onOpen={() => onOpen(node.id)} />
          </div>
        )}
    </>
  )
}
