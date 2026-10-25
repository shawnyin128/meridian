import type { GraphNode } from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import { EntityLink } from '../EntityLink.js'
import { SectionHeading } from '../PageShell.js'
import { AgentLabel } from '../SourceLabel.js'
import { Button } from '../Button.js'
import './IdeaNodeCandidate.css'

/**
 * The research node an agent attached to an idea on arrival, under the research-node heading as a
 * linked node shows, until the user confirms it, which carries the idea out at that node, or dismisses
 * it. Both actions sit in the heading.
 */
export function IdeaNodeCandidate({ node, onConfirm, onDismiss }: {
  node: { id: string; label: string; mode: NonNullable<GraphNode['mode']> }
  onConfirm: () => void
  onDismiss: () => void
}) {
  const m = useMessages()
  return (
    <>
      <SectionHeading
        level="group"
        actions={(
          <>
            <Button size="compact" onClick={onDismiss}>{m.ideas.candidate.dismiss}</Button>
            <Button size="compact" onClick={onConfirm}>{m.common.confirm}</Button>
          </>
        )}
      >{m.project.plan.nodeHeading}
      </SectionHeading>
      <div className="idea-node-candidate" data-node={node.id}>
        <EntityLink kind="node" label={node.label} mode={node.mode} />
        <AgentLabel />
      </div>
    </>
  )
}
