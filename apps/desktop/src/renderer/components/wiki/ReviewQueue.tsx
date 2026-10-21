import { useState } from 'react'
import type { ConflictTarget, DiffPiece, Evidence, ProposalOp, WikiProposal } from '../../../shared/contract.js'
import { localDayOf } from '../../../shared/dates.js'
import { PAPER_PAGE } from '../../../shared/vocabulary.js'
import { useFormat } from '../../lib/format.js'
import type { Catalog } from '../../messages/catalog.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionPopover } from '../ActionPopover.js'
import { DiffLines, LinePieces, paperLine, type DiffLine } from '../DiffLines.js'
import { EmptyState } from '../EmptyState.js'
import { FormInput } from '../FormControls.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { SectionHeading } from '../PageShell.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { AgentLabel } from '../SourceLabel.js'
import { Tag, TagButton } from '../Tag.js'
import { PaperText } from '../paper/PaperText.js'
import { ClaimSide, type ClaimLinks } from './WikiClaims.js'
import './ReviewQueue.css'

/** Local calendar day, the vault's day, a proposal arrived or was decided, from epoch ms. */
const dayOf = (ms: number): string => localDayOf(new Date(ms).toISOString())

/** A line's text, or `message` placing the paper title `title` in it. */
type Titled = string | { message: (title: string) => string; title: string }

/** `text` with `wrap` around it; a paper title it names stays where it was placed. */
const within = (text: Titled, wrap: (inner: string) => string): Titled =>
  (typeof text === 'string' ? wrap(text) : { message: (title) => wrap(text.message(title)), title: text.title })

/** A Wiki page id as Core's findings write it. */
const PAGE_ID = /[\p{L}\p{N}._-]+\/[\p{L}\p{N}._-]+/gu

/**
 * `text`, a finding Core wrote, in pieces: each page id `titles` names reads as its title, a paper
 * page's as paper text; everything else stays as written.
 */
function named(text: string, titles: Record<string, string>): DiffPiece[] {
  const pieces: DiffPiece[] = []
  let from = 0
  for (const match of text.matchAll(PAGE_ID)) {
    const title = titles[match[0]]
    if (title === undefined) continue
    pieces.push(text.slice(from, match.index), match[0].startsWith(PAPER_PAGE) ? { paper: title } : title)
    from = match.index + match[0].length
  }
  return [...pieces, text.slice(from)]
}

/** `text` as a change line, its paper title as paper text. */
const lineOf = (text: Titled): DiffLine => (typeof text === 'string' ? text : paperLine(text.message, text.title))

/** What one op of a proposal does: the page it writes, its change lines and the evidence it adds. */
type Change = { target: string; lines: Titled[]; evidence: Evidence[] }

/**
 * The change `op` in `p` makes: the page it writes, the one core/wiki touchedPages names first for it;
 * its change lines, everything applying it would write but its evidence, with claims by their current
 * text and pages, papers, projects, nodes and conclusions by their titles (the id stands for one no
 * longer in the vault), paper titles as paper text, a revision showing the old text and the new one;
 * and the evidence items it adds.
 */
function changeOf(op: ProposalOp, p: WikiProposal, w: Catalog['wiki']): Change {
  const c = w.queue.change
  const title = (id: string): string => p.titles[id] ?? id
  const text = (ref: string): string => p.claimTexts[ref] ?? ref.split('#')[1]!
  const paper = (id: string, message: (title: string) => string = (name) => name): Titled => ({ message, title: title(id) })
  const target = op.op === 'setMembership' || op.op === 'removeMembership' ? op.paper
    : op.op === 'createAggregation' ? op.id : op.page
  /** The other side of a conflict: a claim's text, a source passage, or a project node or conclusion. */
  const against = (item: ConflictTarget): Titled => {
    switch (item.kind) {
      case 'claim': return text(item.ref)
      case 'source': return paper(item.paper, (name) => c.quote(name, item.page, item.quote))
      case 'experiment': {
        const point = item.node ?? item.conclusion
        const name = [title(`projects/${item.project}`), ...(point === undefined ? [] : [title(`projects/${item.project}#${point}`)])]
        return c.detail(name.join(' · '), item.text ?? '')
      }
    }
  }
  const only = (lines: Titled[], evidence: Evidence[] = []): Change => ({ target, lines, evidence })
  switch (op.op) {
    case 'addClaim': return only([c.add(op.claim.text)], op.claim.evidence)
    case 'reviseClaim': {
      const held = p.claimTexts[`${op.page}#${op.claim}`]
      return only([...(held === undefined ? [] : [c.before(held)]), c.after(op.text)], op.evidence ?? [])
    }
    case 'addEvidence': return only([c.evidence(text(`${op.page}#${op.claim}`))], op.evidence)
    case 'markConflict':
      return only([within(against(op.conflict.against), (shown) => c.conflict(text(`${op.page}#${op.claim}`), shown, op.conflict.note))])
    case 'resolveConflict': return only([c.resolve(text(`${op.page}#${op.claim}`), c.outcomes[op.outcome], op.note)])
    case 'retractClaim': return only([c.retract(text(`${op.page}#${op.claim}`), op.reason)])
    default: return only([c.other])
  }
}

/** The chip of page `id` of `p`, by its title (a paper's as paper text), that opens it through `links`. */
function PageChip({ id, p, links }: { id: string; p: WikiProposal; links: ClaimLinks }) {
  return (
    <TagButton shape="chip" className="tagchip" data-wk={id} onClick={() => links.openPage(id)}>
      {id.startsWith(PAPER_PAGE) ? <PaperText text={p.titles[id] ?? id} /> : p.titles[id] ?? id}
    </TagButton>
  )
}

/**
 * The changes of `p`, each as its change lines and then the evidence it adds, under the page it writes;
 * consecutive changes to the same page share one link to it. `declined` mutes lines that never took
 * effect. Pages, projects and source passages open through `links`.
 */
function Changes({ p, links, declined = false }: { p: WikiProposal; links: ClaimLinks; declined?: boolean }) {
  const m = useMessages()
  const changes = (p.proposal?.ops ?? []).map((op) => changeOf(op, p, m.wiki))
  const title = (id: string): string => p.titles[id] ?? id
  /** The name an evidence item shows: its paper's, project's, page's or claim's. */
  const name = (item: Evidence): string | undefined => {
    switch (item.kind) {
      case 'source':
      case 'note': return title(item.paper)
      case 'experiment': return title(`projects/${item.project}`)
      case 'wiki': return item.ref.includes('#') ? p.claimTexts[item.ref] ?? item.ref.split('#')[1]! : title(item.ref)
      case 'personal': return undefined
    }
  }
  const point = (item: Evidence): string | undefined => {
    const cited = item.kind === 'experiment' ? item.node ?? item.conclusion : undefined
    return cited === undefined || item.kind !== 'experiment' ? undefined : title(`projects/${item.project}#${cited}`)
  }
  return changes.map((change, at) => (
    <div className="review-change" key={at}>
      {change.target === changes[at - 1]?.target ? null : (
        <div className="wkrel review-target">
          <span className="rl">{m.wiki.queue.target}</span>
          <span className="review-links"><PageChip id={change.target} p={p} links={links} /></span>
        </div>
      )}
      <DiffLines lines={change.lines.map(lineOf)} declined={declined} />
      {change.evidence.length === 0 ? null : (
        <ul className="wkclaim-lines review-evidence">
          {change.evidence.map((item, n) => (
            <li className="wkclaim-evidence" key={n}>
              <ClaimSide item={item} title={name(item)} point={point(item)} links={links} />
            </li>
          ))}
        </ul>
      )}
    </div>
  ))
}

/**
 * The review queue: every queued agent proposal with the agent label, what prompted it, its changes with
 * the page each writes and the evidence each rests on, and any other page it would change, flagged when
 * a page it rests on changed since or when it cites a project conclusion the user has not verified (each
 * opens through `onOpenConclusion`); the user applies it or declines it with an optional reason. Pages,
 * projects and source passages open through `links`. Decided proposals follow under their own heading,
 * each with its outcome. `proposals` is null while they load.
 */
export function ReviewQueue({ proposals, pending, onApply, onDecline, links, onOpenConclusion }: {
  proposals: WikiProposal[] | null
  pending: boolean
  onApply: (proposal: WikiProposal) => void
  onDecline: (proposal: WikiProposal, reason: string) => void
  links: ClaimLinks
  onOpenConclusion: (project: string, conclusion: string) => void
}) {
  const m = useMessages()
  const r = m.wiki.queue
  const fmt = useFormat()
  const [declining, setDeclining] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const queued = (proposals ?? []).filter((p) => p.status === 'queued')
  const decided = (proposals ?? []).filter((p) => p.status !== 'queued')
  const applicable = (p: WikiProposal): boolean => p.proposal !== null && !p.staleNow && (p.unverified ?? []).length === 0
  // The queue's one primary commit is the apply of the first proposal that can be applied.
  const lead = queued.find(applicable)?.id

  const source = (p: WikiProposal): string => {
    if (p.proposal === null) return fmt.date(dayOf(p.received))
    const { trigger } = p.proposal
    const why = trigger.kind !== 'experiment' ? null : r.trigger(
      p.titles[`projects/${trigger.project}`] ?? trigger.project,
      trigger.node === undefined ? null : p.titles[`projects/${trigger.project}#${trigger.node}`] ?? trigger.node,
    )
    return [why, fmt.date(dayOf(p.received))].filter((part) => part !== null).join(' · ')
  }
  /** The pages `p` would write beyond the ones its changes target. */
  const others = (p: WikiProposal): string[] => {
    const targets = new Set((p.proposal?.ops ?? []).map((op) => changeOf(op, p, m.wiki).target))
    return p.pages.filter((id) => !targets.has(id))
  }

  return (
    <>
      {proposals === null
        ? <LoadingPlaceholder shape="rows" />
        : queued.length === 0
        ? <EmptyState variant="section">{r.empty}</EmptyState>
        : (
          <StructuredList variant="embedded" maxVisibleRows="all" className="review-list">
            {queued.map((p) => (
              <StructuredRow key={p.id} className="review-row" data-proposal={p.id}>
                <div className="review-head">
                  <span className="review-title">{p.proposal ? <PaperText text={p.proposal.title} /> : r.unreadable}</span>
                  {p.staleNow ? <Tag tone="warn">{r.stale}</Tag> : null}
                  {(p.unverified ?? []).length > 0 ? <Tag tone="warn">{r.unverified}</Tag> : null}
                  {p.proposal?.producer.kind === 'ai' ? <AgentLabel /> : null}
                </div>
                <div className="review-meta">{source(p)}</div>
                {p.proposal?.rationale ? <p className="review-note">{p.proposal.rationale}</p> : null}
                {p.notice === null ? null : <p className="review-note review-note--warn"><LinePieces pieces={named(p.notice, p.titles)} /></p>}
                {(p.unverified ?? []).length === 0 ? null : (
                  <div className="wkrel review-unverified">
                    <span className="rl">{r.unverifiedLabel}</span>
                    <span className="review-links">
                      {p.unverified!.map((ref) => {
                        const [project, conclusion] = ref.slice('projects/'.length).split('#') as [string, string]
                        return (
                          <TagButton shape="chip" className="tagchip" key={ref} onClick={() => onOpenConclusion(project, conclusion)}>
                            {p.titles[ref] ?? conclusion}
                          </TagButton>
                        )
                      })}
                    </span>
                  </div>
                )}
                <Changes p={p} links={links} />
                {others(p).length === 0 ? null : (
                  <div className="wkrel">
                    <span className="rl">{r.pages}</span>
                    <span className="review-links">{others(p).map((id) => <PageChip key={id} id={id} p={p} links={links} />)}</span>
                  </div>
                )}
                <div className="review-actions">
                  <ActionPopover
                    open={declining === p.id}
                    onOpenChange={(next) => {
                      setDeclining(next ? p.id : null)
                      setReason('')
                    }}
                    contentClassName="ctxmenu review-decline" align="start"
                    trigger={<button type="button" className="btn ghost danger" disabled={pending}>{r.decline}</button>}
                  >
                    <FormInput
                      appearance="field" autoFocus value={reason} placeholder={r.reasonPlaceholder}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <button
                      type="button" className="btn danger" disabled={pending}
                      onClick={() => {
                        setDeclining(null)
                        onDecline(p, reason.trim())
                      }}
                    >{r.declineConfirm}</button>
                  </ActionPopover>
                  <button type="button" className={p.id === lead ? 'btn pri' : 'btn'} disabled={pending || !applicable(p)} onClick={() => onApply(p)}>{r.apply}</button>
                </div>
              </StructuredRow>
            ))}
          </StructuredList>
        )}

      {decided.length === 0
        ? null
        : (
          <>
            <SectionHeading>{r.history(decided.length)}</SectionHeading>
            <StructuredList variant="embedded" className="review-list">
              {decided.map((p) => (
                <StructuredRow key={p.id} className="review-row" data-proposal={p.id}>
                  <div className="review-head">
                    <span className="review-title">{p.proposal ? <PaperText text={p.proposal.title} /> : r.unreadable}</span>
                    <Tag tone={p.status === 'applied' ? 'good' : 'neutral'}>
                      {p.status === 'applied' ? r.applied
                        : p.reason?.kind === 'declined' ? r.rejected : `${r.rejected} · ${r.reasonKind[p.reason?.kind ?? 'invalid']}`}
                    </Tag>
                    {p.proposal?.producer.kind === 'ai' ? <AgentLabel /> : null}
                  </div>
                  <div className="review-meta">
                    {[source(p), p.decided === null ? null : fmt.date(dayOf(p.decided.at))].filter((part) => part !== null).join(' → ')}
                  </div>
                  {p.reason === null || p.reason.message === '' ? null : (
                    <p className="review-note">
                      {p.reason.kind === 'declined' ? p.reason.message
                        : p.reason.kind === 'stale' ? r.staleReason
                          : <LinePieces pieces={named(p.reason.message, p.titles)} />}
                    </p>
                  )}
                  {p.proposal === null ? null : <Changes p={p} links={links} declined={p.status !== 'applied'} />}
                </StructuredRow>
              ))}
            </StructuredList>
          </>
        )}
    </>
  )
}
