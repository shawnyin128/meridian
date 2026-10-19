import { useEffect, useState } from 'react'
import type { PaperReading, PaperRow } from '../../../shared/contract.js'
import { papers } from '../../ipc.js'
import { useMessages } from '../../messages/useMessages.js'
import { useVaultRevision, type JumpAnchor } from '../../shell/AppShell.js'
import { entryAnchor, readingEntries } from './reading-entries.js'
import { EmptyState } from '../EmptyState.js'
import { PageError, SectionHeading } from '../PageShell.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'

const EXCERPT = 2

/**
 * The reading summary in the paper detail: the counts are clickable, and the remark and recent
 * notes come from the same stored record the reader uses.
 */
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
      {remark === '' && entries.length === 0
        ? <EmptyState variant="section">{m.papers.reading.empty}</EmptyState>
        : (
          <StructuredList variant="embedded">
            {remark === '' ? null : <StructuredRow className="nrow"><span className="nt">{remark}</span></StructuredRow>}
            {entries.slice(0, EXCERPT).map((entry) => (
              <StructuredRow className="nrow" key={entry.id} onActivate={() => onRead(entryAnchor(entry))}>
                {entry.quote === null ? null : <span className="nq">“{entry.quote}”</span>}
                <span className="nt">{entry.text}</span>
              </StructuredRow>
            ))}
          </StructuredList>
        )}
      {entries.length > EXCERPT
        ? (
          <button type="button" className="btn ghost sm reading-summary-all" onClick={() => onRead({ panel: 'notes' })}>
            {m.papers.reading.viewAll(entries.length)}
          </button>
        )
        : null}
    </div>
  )
}
