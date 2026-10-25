import type {
  HarnessPaperWikiQuality, HarnessPaperWikiReview, HarnessPaperWikiReviewGroup,
} from '../../../shared/contract.js'
import { useMessages } from '../../messages/useMessages.js'
import type { Catalog } from '../../messages/catalog.js'
import { EmptyState } from '../EmptyState.js'
import { HeadingCount } from '../HeadingCount.js'
import { SourceAnchor } from '../SourceAnchor.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { Tag } from '../Tag.js'
import { Tooltip } from '../Tooltip.js'
import { ProposalRows, ProposalText } from '../wiki/ProposalChange.js'
import './PaperWikiProposalReview.css'

function anchorLabel(anchor: string, m: Catalog): string {
  if (anchor.startsWith('page:')) return m.common.anchor.label(Number(anchor.slice('page:'.length)))
  if (anchor.startsWith('highlight:')) return m.wiki.scope.highlights
  if (anchor.startsWith('note:')) return m.wiki.scope.notes
  if (anchor === 'remark') return m.wiki.scope.remark
  return anchor
}

/** The kind and the number group id `id` names, as `takeaway-3` names kind `takeaway` and number 3. */
function kindOf(id: string): { kind: string; number?: string } {
  const [, kind = id, number] = /^(.+?)(?:-(\d+))?$/.exec(id) ?? []
  return number === undefined ? { kind } : { kind, number }
}

/**
 * The title group `group` shows: the catalog's name for the kind its id names, numbered as its id is,
 * or the title Core stored for a kind the catalog does not name, such as a mechanism component's own name.
 */
function groupTitle(group: HarnessPaperWikiReviewGroup, m: Catalog): string | undefined {
  const { kind, number } = kindOf(group.id)
  const named: Record<string, string> = m.wiki.reviewGroups
  const name = named[kind]
  if (name === undefined) return group.title
  return number === undefined ? name : `${name} ${number}`
}

/**
 * One group of the review: its title and provenance, its unlabelled text in body type, then one aligned
 * list of its labelled rows and what it rests on: the paper's pages as anchors that open the reader
 * there through `onJump`, and the reading records it cites by name.
 */
function ReviewGroup({ group, onJump }: { group: HarnessPaperWikiReviewGroup; onJump: (page: number) => void }) {
  const m = useMessages()
  const g = m.wiki.queue.grounds
  const pages = group.anchors.filter((anchor) => anchor.startsWith('page:')).map((anchor) => Number(anchor.slice('page:'.length)))
  const records = group.anchors.filter((anchor) => !anchor.startsWith('page:'))
  const title = groupTitle(group, m)
  // Core projects each kind's labelled rows in one fixed order (core/harness/paper-wiki.ts).
  const labels: readonly string[] = (m.wiki.reviewRows as Record<string, readonly string[]>)[kindOf(group.id).kind] ?? []
  return (
    <StructuredRow className="paper-wiki-review-group">
      <div className="paper-wiki-review-group-head">
        {title === undefined ? null : <strong>{title}</strong>}
        <Tag>{m.wiki.provenance[group.provenance]}</Tag>
      </div>
      {group.rows.map((row, index) => (row.label === undefined ? <ProposalText key={index}>{row.text}</ProposalText> : null))}
      <ProposalRows rows={[
        ...group.rows.flatMap((row, index) => (row.label === undefined ? [] : [{
          key: `row-${index}`, label: labels[index] ?? row.label, value: row.text,
        }])),
        ...(pages.length === 0 ? [] : [{
          key: 'pages', label: g.source, value: pages.map((page) => <SourceAnchor key={page} page={page} onOpen={() => onJump(page)} />),
        }]),
        ...(records.length === 0 ? [] : [{ key: 'records', label: g.note, value: records.map((anchor) => anchorLabel(anchor, m)).join(' · ') }]),
      ]} />
    </StructuredRow>
  )
}

/**
 * Where finding path `path` points, in the user's words: the part of the proposal it names, followed
 * by the item's number when it names one item of a list. Undefined for a part this version does not know.
 */
function placeLabel(path: string, m: Catalog): string | undefined {
  const [, part, index] = /^([a-z_]+(?:\.[a-z_]+)?)(?:\[(\d+)\])?(?:\.[a-z_]+)?$/.exec(path) ?? []
  const places: Record<string, string> = m.wiki.quality.places
  const named = part === undefined ? undefined : places[part]
  if (named === undefined || index === undefined) return named
  return `${named} · ${m.wiki.quality.item(Number(index) + 1)}`
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
      {quality.findings.length === 0 ? null : (
        <StructuredList className="paper-wiki-quality-findings" variant="embedded"
          aria-label={m.wiki.quality.findingsListLabel}>
          {quality.findings.map((finding, index) => {
            const findingCopy: Record<string, { title: string; detail: string }> = m.wiki.quality.findings
            const copy = findingCopy[finding.code]
            const place = placeLabel(finding.path, m)
            return (
              <StructuredRow className="paper-wiki-quality-finding"
                key={`${finding.dimension}-${finding.code}-${finding.path}-${index}`}>
                <Tooltip label={copy?.detail ?? finding.message}>
                  <strong>{copy?.title ?? m.wiki.quality.needsReviewFallback}</strong>
                </Tooltip>
                {place === undefined ? null : <span className="paper-wiki-quality-place">{place}</span>}
              </StructuredRow>
            )
          })}
        </StructuredList>
      )}
    </section>
  )
}

/**
 * Read-only, provenance-visible review of the Core-authored proposal projection; a page a group rests
 * on opens the reader there through `onJump`. Each section is named by its id in the catalog, or by
 * the words Core stored for an id this version does not know.
 */
export function PaperWikiProposalReview({ review, quality, onJump }: {
  review: HarnessPaperWikiReview
  quality?: HarnessPaperWikiQuality
  onJump: (page: number) => void
}) {
  const m = useMessages()
  const named: Record<string, { title: string; empty: string }> = m.wiki.reviewSections
  return (
    <div className="paper-wiki-structured-review">
      {quality === undefined ? null : <QualityReport quality={quality} />}
      {review.sections.map((section) => {
        const words = named[section.id] ?? { title: section.title, empty: section.emptyLabel }
        return (
          <section className="paper-wiki-review-section" key={section.id}>
            <div className="paper-wiki-review-section-head">
              <h4>{words.title}<HeadingCount count={section.groups.length} /></h4>
            </div>
            {section.groups.length === 0 ? (
              <EmptyState variant="section">{words.empty}</EmptyState>
            ) : (
              <StructuredList
                variant="embedded"
                aria-label={words.title}
              >
                {section.groups.map((group) => <ReviewGroup group={group} key={group.id} onJump={onJump} />)}
              </StructuredList>
            )}
          </section>
        )
      })}
    </div>
  )
}
