import type { PaperReading } from '../../../shared/contract.js'
import type { JumpAnchor } from '../../shell/AppShell.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { PageError, SectionHeading } from '../PageShell.js'
import { Item } from '../Item.js'
import { List } from '../List.js'
import { EmptyState } from '../EmptyState.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { entryAnchor, readingEntries } from '../paper-table/reading-entries.js'
import { FadeText } from '../FadeText.js'
import { HeadingCount } from '../HeadingCount.js'
import './PaperUnderstanding.css'

/**
 * Personal reading state shown beside, but never merged into, canonical Wiki content. `reading` is
 * null until it is read; the section then shows its loading placeholder, or `error`, why reading it
 * failed.
 */
export function PaperUnderstanding({ reading, error, onRead }: {
  reading: PaperReading | null
  error: string | null
  onRead: (anchor?: JumpAnchor) => void
}) {
  const m = useMessages()
  const fmt = useFormat()
  if (reading === null) {
    return (
      <section className="paper-understanding" aria-label={m.papers.understanding.ariaLabel}>
        <SectionHeading>{m.papers.understanding.heading}</SectionHeading>
        {error === null ? <LoadingPlaceholder shape="lines" count={2} /> : <PageError variant="section" error={error} />}
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
              <div className="paper-understanding-label">{m.papers.understanding.notesLabel}<HeadingCount count={entries.length} /></div>
              <List variant="embedded" aria-label={m.papers.understanding.notesAria}>
                {entries.map((entry) => (
                  <Item
                    className="paper-understanding-row" key={entry.id} columns="74px minmax(0,1fr)"
                    onActivate={() => onRead(entryAnchor(entry))}
                  >
                    <span className="paper-understanding-page">{m.papers.understanding.page(entry.page)}</span>
                    <span className="paper-understanding-note">
                      {entry.quote === null ? null : <FadeText className="paper-understanding-quote">“{entry.quote}”</FadeText>}
                      <span>{entry.text}</span>
                      <span className="paper-understanding-date">{m.papers.understanding.updated(fmt.date(entry.updated))}</span>
                    </span>
                  </Item>
                ))}
              </List>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
