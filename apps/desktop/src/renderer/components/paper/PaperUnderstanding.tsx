import type { PaperReading } from '../../../shared/contract.js'
import type { JumpAnchor } from '../../shell/AppShell.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { SectionHeading } from '../PageShell.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { EmptyState } from '../EmptyState.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { entryAnchor, readingEntries } from '../paper-table/reading-entries.js'
import { FadeText } from '../FadeText.js'
import './PaperUnderstanding.css'

/** Personal reading state shown beside, but never merged into, canonical Wiki content. */
export function PaperUnderstanding({ reading, onRead }: {
  reading: PaperReading | null
  onRead: (anchor?: JumpAnchor) => void
}) {
  const m = useMessages()
  const fmt = useFormat()
  if (reading === null) {
    return (
      <section className="paper-understanding" aria-label={m.papers.understanding.ariaLabel}>
        <SectionHeading>{m.papers.understanding.heading}</SectionHeading>
        <LoadingPlaceholder shape="lines" count={2} />
      </section>
    )
  }

  const entries = readingEntries(reading)
  const hasRemark = reading.remark.trim() !== ''
  const empty = !hasRemark && entries.length === 0
  return (
    <section className="paper-understanding" aria-label={m.papers.understanding.ariaLabel}>
      <SectionHeading>{m.papers.understanding.heading}</SectionHeading>
      {empty ? (
        <EmptyState variant="section">{m.papers.understanding.empty}</EmptyState>
      ) : (
        <>
          {hasRemark ? (
            <div className="paper-understanding-remark">
              <div className="paper-understanding-label">{m.papers.understanding.remarkLabel}</div>
              <div className="paper-understanding-text">{reading.remark}</div>
            </div>
          ) : null}
          {entries.length > 0 ? (
            <div className="paper-understanding-notes">
              <div className="paper-understanding-label">{m.papers.understanding.notesLabel(entries.length)}</div>
              <StructuredList variant="embedded" aria-label={m.papers.understanding.notesAria}>
                {entries.map((entry) => (
                  <StructuredRow
                    className="paper-understanding-row" key={entry.id} columns="74px minmax(0,1fr)"
                    onActivate={() => onRead(entryAnchor(entry))}
                  >
                    <span className="paper-understanding-page">{m.papers.understanding.page(entry.page)}</span>
                    <span className="paper-understanding-note">
                      {entry.quote === null ? null : <FadeText className="paper-understanding-quote">“{entry.quote}”</FadeText>}
                      <span>{entry.text}</span>
                      <span className="paper-understanding-date">{m.papers.understanding.updated(fmt.date(entry.updated))}</span>
                    </span>
                  </StructuredRow>
                ))}
              </StructuredList>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
