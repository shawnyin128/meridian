import type {
  HarnessPaperWikiQuality, HarnessPaperWikiReview, HarnessPaperWikiReviewGroup,
} from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import './PaperWikiProposalReview.css'

function anchorLabel(anchor: string, m: Catalog): string {
  if (anchor.startsWith('page:')) return m.wiki.anchors.page(anchor.slice('page:'.length))
  if (anchor.startsWith('highlight:')) return m.wiki.scope.highlights
  if (anchor.startsWith('note:')) return m.wiki.scope.notes
  if (anchor === 'remark') return m.wiki.scope.remark
  return anchor
}

function ReviewGroup({ group }: { group: HarnessPaperWikiReviewGroup }) {
  const m = useMessages()
  return (
    <StructuredRow className="paper-wiki-review-group">
      <div className="paper-wiki-review-group-head">
        {group.title === undefined ? null : <strong>{group.title}</strong>}
        <span className={`paper-wiki-provenance ${group.provenance}`}>
          {m.wiki.provenance[group.provenance]}
        </span>
      </div>
      <div className="paper-wiki-review-fields">
        {group.rows.map((row, index) => (
          <div className="paper-wiki-review-field" key={`${row.label ?? 'text'}-${index}`}>
            {row.label === undefined ? null : <span>{row.label}</span>}
            <p>{row.text}</p>
          </div>
        ))}
      </div>
      {group.anchors.length === 0 ? null : (
        <div className="paper-wiki-review-anchors" aria-label={m.wiki.groundsLabel}>
          {group.anchors.map((anchor) => (
            <span key={anchor} title={anchor}>{anchorLabel(anchor, m)}</span>
          ))}
        </div>
      )}
    </StructuredRow>
  )
}

function QualityReport({ quality }: { quality: HarnessPaperWikiQuality }) {
  const m = useMessages()
  const title = quality.passed
    ? m.wiki.quality.passedTitle
    : m.wiki.quality.findingsTitle(quality.findings.length)
  return (
    <section className={`paper-wiki-quality ${quality.passed ? 'passed' : 'needs-review'}`}
      aria-label={m.wiki.quality.heading}>
      <div className="paper-wiki-quality-head">
        <strong>{m.wiki.quality.heading}</strong>
        <span>{title}</span>
      </div>
      <p>
        {quality.passed ? m.wiki.quality.passedNote : m.wiki.quality.needsReviewNote}
      </p>
      {quality.findings.length === 0 ? null : (
        <StructuredList className="paper-wiki-quality-findings" variant="embedded"
          aria-label={m.wiki.quality.findingsListLabel} style={{ '--structured-list-row-height': '68px' }}>
          {quality.findings.map((finding, index) => {
            const findingCopy: Record<string, { title: string; detail: string }> = m.wiki.quality.findings
            const copy = findingCopy[finding.code]
            return (
              <StructuredRow className="paper-wiki-quality-finding"
                key={`${finding.dimension}-${finding.code}-${finding.path}-${index}`}>
                <div>
                  <strong>{copy?.title ?? m.wiki.quality.needsReviewFallback}</strong>
                  <span>{m.wiki.quality.dimension[finding.dimension]}</span>
                </div>
                <p>{copy?.detail ?? finding.message}</p>
                <code>{finding.path}</code>
              </StructuredRow>
            )
          })}
        </StructuredList>
      )}
    </section>
  )
}

/** Read-only, provenance-visible review of the Core-authored proposal projection. */
export function PaperWikiProposalReview({ review, quality }: {
  review: HarnessPaperWikiReview
  quality?: HarnessPaperWikiQuality
}) {
  const m = useMessages()
  return (
    <div className="paper-wiki-structured-review">
      {quality === undefined ? null : <QualityReport quality={quality} />}
      <p className="paper-wiki-review-legend">
        {m.wiki.review.legend}
      </p>
      {review.sections.map((section) => (
        <section className="paper-wiki-review-section" key={section.id}>
          <div className="paper-wiki-review-section-head">
            <h4>{section.title}</h4>
            <span>{section.groups.length}</span>
          </div>
          {section.groups.length === 0 ? (
            <p className="paper-wiki-review-empty">{section.emptyLabel}</p>
          ) : (
            <StructuredList
              variant="embedded"
              aria-label={section.title}
              style={{ '--structured-list-row-height': '128px' }}
            >
              {section.groups.map((group) => <ReviewGroup group={group} key={group.id} />)}
            </StructuredList>
          )}
        </section>
      ))}
    </div>
  )
}
