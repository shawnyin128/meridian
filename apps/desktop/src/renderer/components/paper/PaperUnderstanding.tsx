import type { PaperReading } from '../../../shared/contract.js'
import type { ReaderAnchor } from '../../shell/AppShell.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { SectionHeading } from '../PageShell.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { EmptyState } from '../EmptyState.js'
import { entryAnchor, readingEntries } from '../paper-table/reading-entries.js'
import './PaperUnderstanding.css'

/** Personal reading state shown beside, but never merged into, canonical Wiki content. */
export function PaperUnderstanding({ reading, onRead }: {
  reading: PaperReading | null
  onRead: (anchor?: ReaderAnchor) => void
}) {
  const m = useMessages()
  const fmt = useFormat()
  if (reading === null) {
    return (
      <section className="paper-understanding" aria-label={m.papers.understanding.ariaLabel}>
        <SectionHeading variant="content">{m.papers.understanding.heading}</SectionHeading>
        <p className="lm">{m.papers.understanding.loading}</p>
      </section>
    )
  }

  const entries = readingEntries(reading)
  const hasRemark = reading.remark.trim() !== ''
  return (
    <section className="paper-understanding" aria-label={m.papers.understanding.ariaLabel}>
      <SectionHeading variant="content">{m.papers.understanding.heading}</SectionHeading>
      {!hasRemark && entries.length === 0 ? (
        <div className="paper-understanding-empty">
          <EmptyState variant="section">{m.papers.understanding.empty}</EmptyState>
          <button type="button" className="btn plain" onClick={() => onRead()}>{m.papers.understanding.goRead}</button>
        </div>
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
                      {entry.quote === null ? null : <span className="paper-understanding-quote">“{entry.quote}”</span>}
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
