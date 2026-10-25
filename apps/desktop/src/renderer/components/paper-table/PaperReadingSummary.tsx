import { useEffect, useState } from 'react'
import type { PaperReading, PaperRow } from '../../../shared/contract.js'
import { papers } from '../../ipc.js'
import { useScreenLoad } from '../../hooks/useScreenLoad.js'
import { useMessages } from '../../messages/useMessages.js'
import { useVaultRevision, type JumpAnchor } from '../../shell/AppShell.js'
import { entryAnchor, readingEntries } from './reading-entries.js'
import { EmptyState } from '../EmptyState.js'
import { EntityLink } from '../EntityLink.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { PageError, SectionHeading } from '../PageShell.js'
import { Item } from '../Item.js'
import { List } from '../List.js'
import { Button } from '../Button.js'

const EXCERPT = 2

/**
 * The reading summary in the paper detail: the note and conclusion counts as property values, each above
 * zero a link, the notes opening the reader at its notes through `onRead` and the conclusions through
 * `onConclusions`; then the remark and recent notes from the same stored record the reader uses.
 */
export function PaperReadingSummary({ paper, onRead, onConclusions }: {
  paper: PaperRow
  onRead: (anchor: JumpAnchor) => void
  onConclusions: () => void
}) {
  const m = useMessages()
  const { revision } = useVaultRevision()
  const [reading, setReading] = useState<PaperReading | null>(null)
  const { error, load } = useScreenLoad()

  useEffect(() => load('reading', papers.reading(paper.id), setReading), [paper.id, revision, load])

  const held = reading?.paperId === paper.id ? reading : null
  const entries = held === null ? [] : readingEntries(held)
  const remark = held?.remark ?? ''
  return (
    <div className="paper-reading-summary">
      <dl className="paper-meta-list">
        <dt>{m.papers.reading.notes}</dt>
        <dd>{paper.noteCount === 0
          ? paper.noteCount
          : <EntityLink kind="paper" label={paper.noteCount} onOpen={() => onRead({ panel: 'notes' })} />}</dd>
        <dt>{m.papers.reading.conclusions}</dt>
        <dd>{paper.conclusionCount === 0
          ? paper.conclusionCount
          : <EntityLink kind="page" label={paper.conclusionCount} onOpen={onConclusions} />}</dd>
      </dl>
      <SectionHeading level="group">{m.papers.reading.remarkAndNotes}</SectionHeading>
      <PageError error={error} />
      {held === null
        ? (error === null ? <LoadingPlaceholder shape="rows" count={2} /> : null)
        : remark === '' && entries.length === 0
        ? <EmptyState variant="section">{m.papers.reading.empty}</EmptyState>
        : (
          <List variant="embedded">
            {remark === '' ? null : <Item className="nrow"><span className="nt">{remark}</span></Item>}
            {entries.slice(0, EXCERPT).map((entry) => (
              <Item className="nrow" key={entry.id} onActivate={() => onRead(entryAnchor(entry))}>
                {entry.quote === null ? null : <span className="nq">“{entry.quote}”</span>}
                <span className="nt">{entry.text}</span>
              </Item>
            ))}
          </List>
        )}
      {entries.length > EXCERPT
        ? (
          <Button size="compact" variant="ghost" className="reading-summary-all" onClick={() => onRead({ panel: 'notes' })}>
            {m.papers.reading.viewAll(entries.length)}
          </Button>
        )
        : null}
    </div>
  )
}
