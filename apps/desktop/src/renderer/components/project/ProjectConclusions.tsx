import { useState } from 'react'
import type { Conclusion, ProjectDetail } from '../../../shared/contract.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { SectionHeading } from '../PageShell.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { ConclusionWriteBack } from '../wiki/ConclusionWriteBack.js'
import './ProjectConclusions.css'

/** Tag class of each conclusion state. */
const STATE_CLASS: Record<Conclusion['state'], string> = { pending: 'pend', verified: 'ok', conflicting: 'bad' }

/**
 * A project's conclusions in the order they were recorded, each with its state and date. A verified
 * conclusion not yet in the Wiki offers to be written there as a claim; one already written links to the
 * Wiki page of each claim that cites it. Nothing shows while the project has no conclusions.
 */
export function ProjectConclusions({ project, onOpenPage }: {
  project: ProjectDetail
  onOpenPage: (page: string) => void
}) {
  const m = useMessages()
  const c = m.project.conclusions
  const fmt = useFormat()
  const [writing, setWriting] = useState<Conclusion | null>(null)
  if (project.conclusionList.length === 0) return null
  return (
    <>
      <SectionHeading variant="content">{c.heading(project.conclusionList.length)}</SectionHeading>
      <StructuredList variant="embedded" className="project-conclusions">
        {project.conclusionList.map((conclusion) => {
          const claims = project.conclusionClaims?.[conclusion.id] ?? []
          return (
            <StructuredRow key={conclusion.id} className="project-conclusion" data-conclusion={conclusion.id}>
              <span className={`stag ${STATE_CLASS[conclusion.state]}`}>{c.state[conclusion.state]}</span>
              <span className="project-conclusion-text">{conclusion.text}</span>
              <span className="project-conclusion-date">{fmt.date(conclusion.date)}</span>
              {claims.map((ref) => (
                <button
                  type="button" key={ref} className="btn plain project-conclusion-written" data-wk={ref.split('#')[0]}
                  onClick={() => onOpenPage(ref.split('#')[0]!)}
                >{c.written}</button>
              ))}
              {claims.length === 0 && conclusion.state === 'verified'
                ? (
                  <button type="button" className="btn plain project-conclusion-write" onClick={() => setWriting(conclusion)}>
                    {c.writeBack}
                  </button>
                )
                : null}
            </StructuredRow>
          )
        })}
      </StructuredList>
      <ConclusionWriteBack project={project} conclusion={writing} onClose={() => setWriting(null)} />
    </>
  )
}
