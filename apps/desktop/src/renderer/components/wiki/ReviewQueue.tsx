import type { ReactNode } from 'react'
import type { ConflictTarget, DiffPiece, Evidence, ProposalOp, WikiProposal } from '../../../shared/contract.js'
import { localDayOf } from '../../../shared/dates.js'
import { PAPER_PAGE } from '../../../shared/vocabulary.js'
import { useDrafts } from '../../hooks/useDrafts.js'
import { useFormat } from '../../lib/format.js'
import { useMessages } from '../../messages/useMessages.js'
import { ActionPopover } from '../ActionPopover.js'
import { LinePieces } from '../DiffLines.js'
import { EmptyState } from '../EmptyState.js'
import { EntityLink } from '../EntityLink.js'
import { FormInput } from '../FormControls.js'
import { InlineMessage } from '../InlineMessage.js'
import { LoadingPlaceholder } from '../LoadingPlaceholder.js'
import { SectionHeading } from '../PageShell.js'
import { SourceAnchor } from '../SourceAnchor.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { AgentLabel } from '../SourceLabel.js'
import { Tag, TagButton } from '../Tag.js'
import { PaperText } from '../paper/PaperText.js'
import { ProposalCard, ProposalChange, ProposalDecision, ProposalRows, ProposalText, type ProposalRow } from './ProposalChange.js'
import type { ClaimLinks } from './WikiClaims.js'
import { Button } from '../Button.js'
import './ReviewQueue.css'

/** Local calendar day, the vault's day, a proposal arrived or was decided, from epoch ms. */
const dayOf = (ms: number): string => localDayOf(new Date(ms).toISOString())

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

/** The page an op writes, as core/wiki touchedPages names it first, except that a membership goes to the page it joins or leaves. */
const targetOf = (op: ProposalOp): string => (op.op === 'setMembership' || op.op === 'removeMembership' ? op.in
  : op.op === 'createAggregation' ? op.id : op.page)

/** The pages the block of `op` names: its target, and the paper of a membership. */
const blockPages = (op: ProposalOp): string[] =>
  (op.op === 'setMembership' || op.op === 'removeMembership' ? [op.in, op.paper] : [targetOf(op)])

/** The Lab results the blocks of `ops` show: the experiment evidence they add and the experiments they conflict with. */
const experimentsOf = (ops: ProposalOp[]): Extract<Evidence, { kind: 'experiment' }>[] => ops.flatMap((op) => {
  const items: (Evidence | ConflictTarget)[] = op.op === 'addClaim' ? op.claim.evidence
    : op.op === 'reviseClaim' || op.op === 'addEvidence' ? op.evidence ?? []
      : op.op === 'markConflict' ? [op.conflict.against] : []
  return items.flatMap((item) => (item.kind === 'experiment' ? [item] : []))
})

/**
 * The blocks of proposal `p`, one per op, each showing where the op writes, what it writes by current
 * claim texts and by the titles of pages, papers, projects, nodes, columns and kinds (the id stands for
 * one no longer in the vault), and what it rests on. `by` and `context` end and follow the first
 * block's first line. Pages, projects, conclusions and source passages open through `links` and
 * `onOpenConclusion`.
 */
function Blocks({ p, links, onOpenConclusion, by, context }: {
  p: WikiProposal
  links: ClaimLinks
  onOpenConclusion: (project: string, conclusion: string) => void
  by: ReactNode
  context: ReactNode
}) {
  const m = useMessages()
  const r = m.wiki.queue
  const g = r.grounds
  const f = r.fields
  const fmt = useFormat()
  const title = (id: string): string => p.titles[id] ?? id
  const text = (ref: string): string => p.claimTexts[ref] ?? ref.split('#')[1]!
  const paperName = (id: string) => <PaperText text={title(id)} />
  const page = (id: string) => (
    <EntityLink
      kind="page" data-wk={id} label={id.startsWith(PAPER_PAGE) ? paperName(id) : title(id)}
      onOpen={() => links.openPage(id)}
    />
  )
  const pages = (ids: string[]) => (ids.length === 0 ? m.common.none : ids.map((id) => <span key={id}>{page(id)}</span>))
  const anchor = (paper: string, at: number, quote?: string, highlight?: string) => (
    <SourceAnchor
      page={at} quote={quote} separator=" · "
      onOpen={() => links.openReader(paper, { page: at, ...(highlight === undefined ? {} : { highlight }) })}
    />
  )
  /** The row of an evidence item, or with `label` of the other side of a conflict; `state` adds whether a cited conclusion is verified. */
  const row = (item: Evidence | ConflictTarget, key: string, label?: string, state = false): ProposalRow => {
    switch (item.kind) {
      case 'experiment': {
        const point = (item.node ?? item.conclusion)!
        const verified = !(p.unverified ?? []).includes(`projects/${item.project}#${point}`)
        return {
          key, label: label ?? g.experiment, ...(item.text ? { quote: item.text } : {}),
          value: (
            <>
              <EntityLink kind="project" label={title(`projects/${item.project}`)} onOpen={() => links.openProject(item.project)} />
              <span className="proposal-sep" aria-hidden="true">›</span>
              <EntityLink kind="project" label={title(`projects/${item.project}#${point}`)} onOpen={() => onOpenConclusion(item.project, point)} />
              {state ? <Tag tone={verified ? 'good' : 'warn'}>{verified ? r.verified : r.notVerified}</Tag> : null}
            </>
          ),
        }
      }
      case 'source':
        return {
          key, label: label ?? g.source, quote: <q>{item.quote}</q>,
          value: <span>{paperName(item.paper)}{anchor(item.paper, item.page, item.quote, item.highlight)}</span>,
        }
      case 'claim':
      case 'wiki':
        return {
          key, label: label ?? g.wiki, value: page(item.ref.split('#')[0]!),
          ...(item.ref.includes('#') ? { quote: text(item.ref) } : {}),
        }
      case 'note':
        return {
          key, label: g.note,
          value: (
            <EntityLink
              kind="paper" label={paperName(item.paper)}
              onOpen={() => links.openReader(item.paper, item.highlight === undefined ? { panel: 'notes', note: item.note! } : { highlight: item.highlight })}
            />
          ),
        }
      case 'personal':
        return { key, label: g.personal, ...(item.text === '' ? {} : { value: item.text }) }
    }
  }
  const evidence = (items: Evidence[]) => items.map((item, at) => row(item, `e${at}`, undefined, p.status === 'queued'))
  const claim = (pageId: string, id: string) => <ProposalText role="context">{text(`${pageId}#${id}`)}</ProposalText>

  /** What op `op` writes: its texts, its labelled fields and the rows of what it rests on. */
  const parts = (op: ProposalOp): { texts?: ReactNode; fields?: ProposalRow[]; grounds?: ProposalRow[] } => {
    switch (op.op) {
      case 'addClaim': return { texts: <ProposalText>{op.claim.text}</ProposalText>, grounds: evidence(op.claim.evidence) }
      case 'reviseClaim': {
        const held = p.claimTexts[`${op.page}#${op.claim}`]
        return {
          texts: <>{held === undefined ? null : <ProposalText role="removed">{held}</ProposalText>}<ProposalText>{op.text}</ProposalText></>,
          grounds: evidence(op.evidence ?? []),
        }
      }
      case 'addEvidence': return { texts: claim(op.page, op.claim), grounds: evidence(op.evidence) }
      case 'markConflict': return {
        texts: claim(op.page, op.claim),
        fields: [{ key: 'note', label: f.note, value: op.conflict.note }],
        grounds: [row(op.conflict.against, 'against', g.conflict)],
      }
      case 'resolveConflict': return {
        texts: claim(op.page, op.claim),
        fields: [{ key: 'outcome', label: f.outcome, value: r.outcomes[op.outcome], quote: op.note }],
      }
      case 'retractClaim': return {
        texts: <ProposalText role="removed">{text(`${op.page}#${op.claim}`)}</ProposalText>,
        fields: [{ key: 'reason', label: f.reason, value: op.reason }],
      }
      case 'createAggregation': return {
        ...(op.describe === '' ? {} : { texts: <ProposalText>{op.describe}</ProposalText> }),
        fields: [
          { key: 'kind', label: f.kind, value: title(op.kind) },
          { key: 'parents', label: f.parents, value: pages(op.parents) },
          { key: 'columns', label: f.columns, value: op.columns.length === 0 ? m.common.none : op.columns.map((c) => c.label).join(' · ') },
          ...(op.splitOn === undefined ? [] : [{ key: 'split', label: f.splitOn, value: op.splitOn }]),
        ],
      }
      case 'setMembership': return {
        fields: [
          { key: 'paper', label: f.paper, value: page(op.paper) },
          ...Object.entries(op.cells).map(([key, cell]) => ({
            key: `cell-${key}`, label: title(`${op.in}#${key}`), quote: <q>{cell.quote}</q>,
            value: <span>{cell.value}{anchor(op.paper, cell.page, cell.quote)}</span>,
          })),
        ],
      }
      case 'removeMembership': return { fields: [{ key: 'paper', label: f.paper, value: page(op.paper) }] }
      case 'appendEntry': return {
        texts: <ProposalText>{op.text}</ProposalText>,
        fields: [{ key: 'section', label: op.section, value: fmt.date(op.date) }],
      }
      case 'setColumns': return {
        fields: [{ key: 'columns', label: f.columns, value: op.columns.length === 0 ? m.common.none : op.columns.map((c) => c.label).join(' · ') }],
      }
      case 'setParents': return { fields: [{ key: 'parents', label: f.parents, value: pages(op.parents) }] }
      case 'setAggregationMetadata': return {
        fields: [
          { key: 'title', label: f.title, value: op.title },
          { key: 'split', label: f.splitOn, value: op.splitOn ?? m.common.none },
        ],
      }
    }
  }

  return (p.proposal?.ops ?? []).map((op, at) => {
    const target = targetOf(op)
    const { texts, fields, grounds } = parts(op)
    return (
      <ProposalChange
        key={at} kind={r.kinds[op.op]}
        target={op.op === 'createAggregation' ? <EntityLink kind="page" label={op.title} /> : page(target)}
        {...(at === 0 ? { by, context } : {})}
        fields={fields} grounds={grounds} groundsLabel={m.wiki.groundsLabel}
      >{texts}</ProposalChange>
    )
  })
}

/**
 * The review queue: every queued agent proposal as a card of its changes, each with where it goes, what
 * it writes and what it rests on, the agent label and the date on the card's first line, and any other
 * page it would write. The user applies it or declines it with an optional reason; when a page it rests
 * on changed since or it cites a project conclusion the user has not verified, applying is blocked and
 * the block sits beside the apply button, opening the changed page or the conclusion through `onOpenConclusion`. The
 * project and node that prompted it show only when no change cites them. Pages, projects and source
 * passages open through `links`. Decided proposals follow under their own heading, muted, each with its
 * outcome. `proposals` is null until they are read; the queue then shows its loading placeholder, or
 * nothing once `failed`.
 */
export function ReviewQueue({ proposals, failed, pending, onApply, onDecline, links, onOpenConclusion }: {
  proposals: WikiProposal[] | null
  failed: boolean
  pending: boolean
  onApply: (proposal: WikiProposal) => void
  onDecline: (proposal: WikiProposal, reason: string) => void
  links: ClaimLinks
  onOpenConclusion: (project: string, conclusion: string) => void
}) {
  const m = useMessages()
  const r = m.wiki.queue
  const fmt = useFormat()
  const queued = (proposals ?? []).filter((p) => p.status === 'queued')
  // A decline reason being typed is kept as a draft of its proposal, and reopens its popover.
  const reasons = useDrafts<string>(['wiki', 'review'], proposals === null ? null : queued.map((p) => p.id))
  const declining = queued.find((p) => reasons.get(p.id) !== undefined)?.id ?? null
  const reason = declining === null ? '' : reasons.get(declining) ?? ''
  const decided = (proposals ?? []).filter((p) => p.status !== 'queued')
  const applicable = (p: WikiProposal): boolean => p.proposal !== null && !p.staleNow && (p.unverified ?? []).length === 0
  // The queue's one primary commit is the apply of the first proposal that can be applied.
  const lead = queued.find(applicable)?.id

  /** The project and node that prompted `p`, unless a change of it cites them. */
  const origin = (p: WikiProposal): ReactNode => {
    const trigger = p.proposal?.trigger
    if (trigger?.kind !== 'experiment') return null
    const cited = experimentsOf(p.proposal!.ops)
      .some((e) => e.project === trigger.project && (trigger.node === undefined || (e.node ?? e.conclusion) === trigger.node))
    if (cited) return null
    return (
      <p className="proposal-context">
        {r.trigger(
          p.titles[`projects/${trigger.project}`] ?? trigger.project,
          trigger.node === undefined ? null : p.titles[`projects/${trigger.project}#${trigger.node}`] ?? trigger.node,
        )}
      </p>
    )
  }
  /** The producer's label and the day `p` arrived. */
  const by = (p: WikiProposal) => (
    <>{p.proposal?.producer.kind === 'ai' ? <AgentLabel /> : null}<span>{fmt.date(dayOf(p.received))}</span></>
  )
  /** The pages `p` would write beyond the ones its blocks name. */
  const others = (p: WikiProposal): string[] => {
    const shown = new Set((p.proposal?.ops ?? []).flatMap(blockPages))
    return p.pages.filter((id) => !shown.has(id))
  }
  /** The parts of a card for `p` before its decision row. */
  const body = (p: WikiProposal) => (
    <>
      {p.proposal === null
        ? <ProposalChange kind={r.unreadable} by={by(p)} />
        : (
          <Blocks
            p={p} links={links} onOpenConclusion={onOpenConclusion} by={by(p)}
            context={<>{origin(p)}{p.proposal.rationale ? <p className="proposal-context">{p.proposal.rationale}</p> : null}</>}
          />
        )}
      <ProposalRows rows={others(p).length === 0 ? [] : [{
        key: 'pages', label: r.pages,
        value: others(p).map((id) => (
          <EntityLink
            key={id} kind="page" data-wk={id} onOpen={() => links.openPage(id)}
            label={id.startsWith(PAPER_PAGE) ? <PaperText text={p.titles[id] ?? id} /> : p.titles[id] ?? id}
          />
        )),
      }]} />
      {p.notice === null
        ? null : <InlineMessage tone="warning" variant="line"><LinePieces pieces={named(p.notice, p.titles)} /></InlineMessage>}
    </>
  )

  return (
    <>
      {proposals === null
        ? (failed ? null : <LoadingPlaceholder shape="rows" />)
        : queued.length === 0
        ? <EmptyState variant="section">{r.empty}</EmptyState>
        : (
          <StructuredList variant="embedded" maxVisibleRows="all" className="review-list">
            {queued.map((p) => {
              const [unverified] = p.unverified ?? []
              return (
                <StructuredRow key={p.id} className="review-row" data-proposal={p.id}>
                  <ProposalCard>
                    {body(p)}
                    <ProposalDecision>
                      <ActionPopover
                        open={declining === p.id}
                        onOpenChange={(next) => {
                          if (declining !== null) reasons.drop(declining)
                          if (next) reasons.set(p.id, '')
                        }}
                        surface="form" contentClassName="review-decline" align="start"
                        trigger={<Button size="compact" variant="ghost" tone="danger" disabled={pending}>{r.decline}</Button>}
                      >
                        <div className="review-decline-form">
                          <FormInput
                            appearance="field" autoFocus value={reason} placeholder={r.reasonPlaceholder}
                            onChange={(e) => reasons.set(p.id, e.target.value)}
                          />
                          <Button
                            size="regular" tone="danger" disabled={pending}
                            onClick={() => {
                              reasons.drop(p.id)
                              onDecline(p, reason.trim())
                            }}
                          >{r.declineConfirm}</Button>
                        </div>
                      </ActionPopover>
                      <Button size="compact" variant={p.id === lead ? 'primary' : 'secondary'} disabled={pending || !applicable(p)} onClick={() => onApply(p)}>{r.apply}</Button>
                      {p.staleNow ? <TagButton tone="warn" onClick={() => links.openPage(p.stalePage!)}>{r.stale}</TagButton> : null}
                      {unverified === undefined ? null : (
                        <TagButton
                          tone="warn"
                          onClick={() => {
                            const [project, conclusion] = unverified.slice('projects/'.length).split('#') as [string, string]
                            onOpenConclusion(project, conclusion)
                          }}
                        >{`${r.unverified} · ${r.verify}`}</TagButton>
                      )}
                    </ProposalDecision>
                  </ProposalCard>
                </StructuredRow>
              )
            })}
          </StructuredList>
        )}

      {decided.length === 0
        ? null
        : (
          <>
            <SectionHeading count={decided.length}>{r.history}</SectionHeading>
            <StructuredList variant="embedded" className="review-list">
              {decided.map((p) => (
                <StructuredRow key={p.id} className="review-row" data-proposal={p.id}>
                  <ProposalCard decided declined={p.status !== 'applied'}>
                    {body(p)}
                    <ProposalDecision>
                      <Tag tone={p.status === 'applied' ? 'good' : 'neutral'}>
                        {p.status === 'applied' ? r.applied
                          : p.reason?.kind === 'declined' ? r.rejected : `${r.rejected} · ${r.reasonKind[p.reason?.kind ?? 'invalid']}`}
                      </Tag>
                      {p.decided === null ? null : <span>{fmt.date(dayOf(p.decided.at))}</span>}
                      {p.reason === null || p.reason.message === '' || p.reason.kind === 'stale' ? null : (
                        <span className="review-reason">
                          {p.reason.kind === 'declined' ? p.reason.message : <LinePieces pieces={named(p.reason.message, p.titles)} />}
                        </span>
                      )}
                    </ProposalDecision>
                  </ProposalCard>
                </StructuredRow>
              ))}
            </StructuredList>
          </>
        )}
    </>
  )
}
