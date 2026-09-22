import { useEffect, useState } from 'react'
import type { PaperReading, PaperRow } from '../../../shared/contract.js'
import { papers } from '../../ipc.js'
import { useMessages } from '../../messages/useMessages.js'
import { useVaultRevision, type JumpAnchor } from '../../shell/AppShell.js'
import { entryAnchor, readingEntries } from './reading-entries.js'
import { EmptyState } from '../EmptyState.js'
import { PageError, SectionHeading } from '../PageShell.js'

const EXCERPT = 2

/** The reading summary in the paper details: the count can be jumped, and the essay and recent notes share the persistent record of the reader. */
export function PaperReadingSummary({ paper, onRead, onConclusions }: {
  paper: PaperRow
  onRead: (anchor: JumpAnchor) => void
  onConclusions: () => void
}) {
  const m = useMessages()
  const { revision } = useVaultRevision()
  const [reading, setReading] = useState<PaperReading | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setError(null)
    void papers.reading(paper.id)
      .then((value) => { if (live) setReading(value) })
      .catch((cause: Error) => { if (live) setError(cause.message) })
    return () => { live = false }
  }, [paper.id, revision])

  const held = reading?.paperId === paper.id ? reading : null
  const entries = held === null ? [] : readingEntries(held)
  const remark = held?.remark ?? ''
  return (
    <div className="paper-reading-summary">
      <dl className="paper-meta-list">
        <dt>{m.papers.reading.notes}</dt>
        <dd>{paper.noteCount === 0
          ? '0'
          : <button className="cnt" onClick={() => onRead({ panel: 'notes' })}>{paper.noteCount}</button>}</dd>
        <dt>{m.papers.reading.conclusions}</dt>
        <dd>{paper.conclusionCount === 0
          ? '0'
          : <button className="cnt" onClick={onConclusions}>{paper.conclusionCount}</button>}</dd>
      </dl>
      <SectionHeading variant="rail">{m.papers.reading.remarkAndNotes}</SectionHeading>
      <PageError error={error} />
      {remark === '' ? null : <div className="nrow"><div className="nt">{remark}</div></div>}
      {entries.slice(0, EXCERPT).map((entry) => (
        <div className="nrow jump" key={entry.id} onClick={() => onRead(entryAnchor(entry))}>
          {entry.quote === null ? null : <div className="nq">“{entry.quote}”</div>}
          <div className="nt">{entry.text}</div>
        </div>
      ))}
      {entries.length > EXCERPT
        ? (
          <button className="lm more" onClick={() => onRead({ panel: 'notes' })}>
            {m.papers.reading.viewAll(entries.length)}
          </button>
        )
        : null}
      {remark === '' && entries.length === 0
        ? <EmptyState variant="section">{m.papers.reading.empty}</EmptyState>
        : null}
    </div>
  )
}
