import { Fragment, useEffect, useRef, useState } from 'react'
import type {
  ConflictTarget, Evidence, ProjectConclusion, ProjectSummary, ProposalOp, WikiAggregation, WikiClaim, WikiConflict,
} from '../../../shared/contract.js'
import { HUMAN_PRODUCER } from '../../../shared/vocabulary.js'
import { useDraft } from '../../hooks/useDrafts.js'
import { project as projectApi } from '../../ipc.js'
import { useFormat } from '../../lib/format.js'
import { claimId } from '../../lib/slug.js'
import { useMessages } from '../../messages/useMessages.js'
import type { JumpAnchor } from '../../shell/AppShell.js'
import { AddAction } from '../AddAction.js'
import { CardTray } from '../CardTray.js'
import { MenuItem } from '../ActionMenu.js'
import { DiffLines } from '../DiffLines.js'
import { DraftForm, DraftLine } from '../DraftForm.js'
import { EmptyState } from '../EmptyState.js'
import { EntityLink } from '../EntityLink.js'
import { ChoicePicker, DotsMenu } from '../FieldPickers.js'
import { FormInput } from '../FormControls.js'
import { SectionHeading } from '../PageShell.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { SourceAnchor } from '../SourceAnchor.js'
import { AgentLabel } from '../SourceLabel.js'
import { RowActions, StructuredList, StructuredRow } from '../StructuredList.js'
import { Tag } from '../Tag.js'
import { PaperText } from '../paper/PaperText.js'
import './WikiClaims.css'

type Outcome = 'revised' | 'split' | 'retracted' | 'dismissed'
const OUTCOMES: readonly Outcome[] = ['dismissed', 'revised', 'split', 'retracted']

/** The form drafted in place in the claims area of `page`, if any. */
type Form = { page: string } & (
  | { kind: 'add' }
  | { kind: 'revise'; claim: WikiClaim }
  | { kind: 'conflict'; claim: WikiClaim }
  | { kind: 'resolve'; claim: WikiClaim; conflict: WikiConflict }
)

/** A drafted form as it is kept: its kind, the ids of the claim and conflict it is about, and its fields. */
type ClaimDraft = {
  kind: Form['kind']
  claim: string | null
  conflict: string | null
  text: string
  note: string
  basis: 'personal' | 'conclusion'
  projectId: string
  conclusionId: string
  other: string
  outcome: Outcome
}

/** Where the claims area sends the user: a Wiki page, a project, or the reader at a paper page. */
export type ClaimLinks = {
  openPage: (id: string) => void
  openProject: (id: string) => void
  openReader: (paper: string, anchor: JumpAnchor) => void
}

/** The first `k<n>` neither claim uses as a conflict id. */
function conflictId(...claims: (WikiClaim | undefined)[]): string {
  const used = new Set(claims.flatMap((c) => c?.conflicts.map((x) => x.id) ?? []))
  let n = 1
  while (used.has(`k${n}`)) n += 1
  return `k${n}`
}

/**
 * One evidence item or conflict target as a line of links: what it is, then where it points. `title` is
 * its display name and `point` the name of the node or conclusion an experiment cites.
 */
export function ClaimSide({ item, title, point, links }: {
  item: Evidence | ConflictTarget; title: string | undefined; point: string | undefined; links: ClaimLinks
}) {
  const m = useMessages()
  const c = m.wiki.claims
  const paper = title === undefined ? null : <PaperText text={title} />
  switch (item.kind) {
    case 'experiment':
      return (
        <>
          <Tag>{c.experiment}</Tag>
          <EntityLink kind="project" label={title} onOpen={() => links.openProject(item.project)} />
          <span className="wkclaim-point">{point}</span>
          {item.text ? <span className="wkclaim-note">{item.text}</span> : null}
        </>
      )
    case 'source':
      return (
        <>
          <Tag>{c.evidence}</Tag>
          <span>{paper}<SourceAnchor
            page={item.page} quote={item.quote} separator=" "
            onOpen={() => links.openReader(item.paper, { page: item.page, ...(item.highlight === undefined ? {} : { highlight: item.highlight }) })}
          /></span>
          <q className="wkclaim-quote">{item.quote}</q>
        </>
      )
    case 'note':
      return (
        <>
          <Tag>{c.note}</Tag>
          <EntityLink
            kind="paper" label={paper}
            onOpen={() => links.openReader(item.paper, item.highlight === undefined ? { panel: 'notes', note: item.note! } : { highlight: item.highlight })}
          />
        </>
      )
    case 'wiki':
    case 'claim':
      return (
        <>
          {item.kind === 'wiki' ? <Tag>{c.evidence}</Tag> : null}
          <EntityLink
            kind="page" label={title} data-wk={item.ref.split('#')[0]} onOpen={() => links.openPage(item.ref.split('#')[0]!)}
          />
        </>
      )
    case 'personal':
      return (
        <>
          <Tag>{c.personal}</Tag>
          {item.text === '' ? null : <span className="wkclaim-note">{item.text}</span>}
        </>
      )
  }
}

/**
 * The claims area of an aggregation page: each claim with its version and date, the agent label when an
 * agent wrote it, its evidence (experiments open the project, source quotes open the reader at their
 * page), its open conflicts with the other side linked, and its earlier versions folded away. The user
 * adds, revises, marks and resolves conflicts on, and retracts claims through `onApply`, which submits
 * one titled list of ops and resolves whether it was written. A new claim is drafted last in the list,
 * where it lands; a revision in its claim's place; a conflict under its claim's lines; a resolution
 * under its conflict. A retract is written at once and asks `onApply` for an `undoable` write. Each
 * write hands `onApply` the `note` that names its result.
 * `arrival`, a claim id, is brought into view once the claims show, after which `onArrived` is called.
 */
export function WikiClaims({ page, pending, links, onApply, arrival, onArrived }: {
  page: WikiAggregation
  pending: boolean
  links: ClaimLinks
  onApply: (title: string, ops: ProposalOp[], done: { note: string; undoable?: boolean }) => Promise<boolean>
  arrival?: string | undefined
  onArrived?: () => void
}) {
  const m = useMessages()
  const c = m.wiki.claims
  const f = c.form
  const fmt = useFormat()
  const [draft, setDraft] = useDraft<ClaimDraft>(['wiki', page.id], 'claim')
  const arrivalRow = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (arrival === undefined) return
    arrivalRow.current?.scrollIntoView({ block: 'center' })
    onArrived?.()
  }, [arrival, page, onArrived])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [conclusions, setConclusions] = useState<ProjectConclusion[]>([])
  const addRow = useRef<HTMLDivElement>(null)
  // A draft picked in a claim's menu opens once the menu has closed, so it keeps the focus.
  const opening = useRef<Form | null>(null)
  const formClaim = draft?.claim === null ? undefined : page.claims.find((x) => x.id === draft?.claim)
  const formConflict = formClaim?.conflicts.find((x) => x.id === draft?.conflict)
  const form: Form | null = draft === null ? null
    : draft.kind === 'add' ? { page: page.id, kind: 'add' }
      : formClaim === undefined ? null
        : draft.kind === 'resolve'
          ? formConflict === undefined ? null : { page: page.id, kind: 'resolve', claim: formClaim, conflict: formConflict }
          : { page: page.id, kind: draft.kind, claim: formClaim }
  // A kept form about a claim or conflict the page no longer holds is dropped.
  useEffect(() => { if (draft !== null && form === null) setDraft(null) })
  const text = draft?.text ?? ''
  const note = draft?.note ?? ''
  const basis = draft?.basis ?? 'personal'
  const projectId = draft?.projectId ?? ''
  const conclusionId = draft?.conclusionId ?? ''
  const other = draft?.other ?? ''
  const outcome = draft?.outcome ?? 'dismissed'
  const patch = (fields: Partial<ClaimDraft>) => { if (draft !== null) setDraft({ ...draft, ...fields }) }

  const open = (next: Form) => {
    if (next.kind === 'add' && form?.kind === 'add') {
      addRow.current?.querySelector<HTMLElement>('.form-control')?.focus()
      return
    }
    setDraft({
      kind: next.kind,
      claim: next.kind === 'add' ? null : next.claim.id,
      conflict: next.kind === 'resolve' ? next.conflict.id : null,
      text: next.kind === 'revise' || next.kind === 'resolve' ? next.claim.text : '',
      note: '', basis: 'personal', projectId: '', conclusionId: '', other: '', outcome: 'dismissed',
    })
  }
  const close = () => setDraft(null)

  useEffect(() => {
    if (form?.kind !== 'add' || basis !== 'conclusion') return
    void projectApi.list().then(setProjects)
  }, [form?.kind, basis])

  useEffect(() => {
    setConclusions([])
    if (projectId === '') return
    void projectApi.get(projectId).then((detail) => setConclusions(
      (detail.projectConclusions ?? []).filter((conclusion) => conclusion.state === 'verified'),
    ))
  }, [projectId])

  const others = form === null || form.kind === 'add' ? [] : page.claims.filter((x) => x.id !== form.claim.id)
  const ids = page.claims.map((x) => x.id)
  /** Whether the drafted claim text cannot be saved: empty, or a revision that changes nothing. */
  const textMissing = text.trim() === ''
    || ((form?.kind === 'revise' || (form?.kind === 'resolve' && outcome === 'revised')) && text.trim() === form.claim.text)

  /** The title and ops the open form submits, or null while it is incomplete. */
  const submission = (): { title: string; ops: ProposalOp[] } | null => {
    if (form === null) return null
    const claim = form.kind === 'add' ? null : form.claim
    switch (form.kind) {
      case 'add': {
        const picked = conclusions.find((x) => x.id === conclusionId)
        if (text.trim() === '' || (basis === 'conclusion' && picked === undefined)) return null
        const evidence: Evidence[] = basis === 'personal'
          ? [{ kind: 'personal', text: note.trim() }]
          : [picked!.node === undefined
            ? { kind: 'experiment', project: projectId, conclusion: picked!.id }
            : { kind: 'experiment', project: projectId, node: picked!.node }]
        return { title: c.proposals.add(page.title), ops: [
          { op: 'addClaim', page: page.id, claim: { id: claimId(text.trim(), ids), text: text.trim(), evidence } },
        ] }
      }
      case 'revise':
        if (text.trim() === '' || text.trim() === claim!.text) return null
        return { title: c.proposals.revise(page.title), ops: [
          { op: 'reviseClaim', page: page.id, claim: claim!.id, text: text.trim() },
        ] }
      case 'conflict': {
        const target = page.claims.find((x) => x.id === other)
        if (target === undefined || note.trim() === '') return null
        return { title: c.proposals.conflict(page.title), ops: [{
          op: 'markConflict', page: page.id, claim: claim!.id,
          conflict: { id: conflictId(claim!, target), against: { kind: 'claim', ref: `${page.id}#${target.id}` }, note: note.trim() },
        }] }
      }
      case 'resolve': {
        if (note.trim() === '') return null
        const resolve: ProposalOp = {
          op: 'resolveConflict', page: page.id, claim: claim!.id, conflict: form.conflict.id, outcome, note: note.trim(),
        }
        const title = c.proposals.resolve(page.title)
        if (outcome === 'dismissed') return { title, ops: [resolve] }
        if (outcome === 'retracted') {
          return { title, ops: [resolve, { op: 'retractClaim', page: page.id, claim: claim!.id, reason: note.trim() }] }
        }
        if (text.trim() === '') return null
        if (outcome === 'revised') {
          if (text.trim() === claim!.text) return null
          return { title, ops: [{ op: 'reviseClaim', page: page.id, claim: claim!.id, text: text.trim() }, resolve] }
        }
        return { title, ops: [{ op: 'addClaim', page: page.id, claim: {
          id: claimId(text.trim(), ids), text: text.trim(), evidence: [{ kind: 'personal', text: note.trim() }],
        } }, resolve] }
      }
    }
  }

  const ready = submission()
  /** Writes the drafted form and closes it once written. */
  const saveDraft = () => (ready === null || form === null ? Promise.resolve(false)
    : onApply(ready.title, ready.ops, { note: c.done[form.kind] }))
    .then((saved) => { if (saved) close() })
  /** Retracts `claim` at once. A retract stores no reason, yet the op requires one, so it carries the action's name. */
  const retract = (claim: WikiClaim) => {
    void onApply(c.proposals.retract(page.title), [
      { op: 'retractClaim', page: page.id, claim: claim.id, reason: c.retract },
    ], { note: c.done.retract, undoable: true })
  }

  const addDraft = form?.kind !== 'add'
    ? null
    : (
      <StructuredRow className="wkclaim wkclaim-draft" rowRef={addRow}>
        <DraftForm canSave={ready !== null} onSave={saveDraft} onCancel={close}>
          {(invalid) => (
            <>
              <FormInput
                value={text} placeholder={f.textPlaceholder} aria-label={f.text} aria-invalid={invalid(text.trim() === '')}
                onChange={(e) => patch({ text: e.target.value })}
              />
              <DraftLine label={f.basis}>
                <SegmentedControl
                  label={f.basisLabel} value={basis} onChange={(next) => patch({ basis: next })}
                  options={[{ value: 'personal', label: f.personal }, { value: 'conclusion', label: f.conclusion }]}
                />
                {basis === 'personal'
                  ? (
                    <FormInput
                      value={note} placeholder={f.personalPlaceholder} aria-label={f.personal} onChange={(e) => patch({ note: e.target.value })}
                    />
                  )
                  : (
                    <>
                      <ChoicePicker
                        appearance="field" aria-label={f.project} placeholder={f.projectPick} value={projectId}
                        aria-invalid={invalid(projectId === '')} options={projects.map((p) => p.id)}
                        label={(id) => projects.find((p) => p.id === id)?.name ?? id}
                        onPick={(id) => patch({ projectId: id, conclusionId: '' })}
                      />
                      {projectId === ''
                        ? null
                        : conclusions.length === 0
                          ? <span className="draft-form-label">{f.noConclusions}</span>
                          : (
                            <ChoicePicker
                              appearance="field" aria-label={f.conclusion} placeholder={f.conclusionPick}
                              value={conclusionId} aria-invalid={invalid(conclusionId === '')}
                              options={conclusions.map((x) => x.id)}
                              label={(id) => conclusions.find((x) => x.id === id)?.text ?? id}
                              onPick={(id) => {
                                const picked = conclusions.find((x) => x.id === id)
                                patch({ conclusionId: id, ...(picked !== undefined && text.trim() === '' ? { text: picked.text } : {}) })
                              }}
                            />
                          )}
                    </>
                  )}
              </DraftLine>
            </>
          )}
        </DraftForm>
      </StructuredRow>
    )

  return (
    <>
      <SectionHeading
        actions={<AddAction variant="section" disabled={pending} label={c.add} onClick={() => open({ page: page.id, kind: 'add' })}>{c.addShort}</AddAction>}
      >{c.heading}
      </SectionHeading>
      {page.claims.length === 0 && addDraft === null
        ? <EmptyState variant="section">{c.empty}</EmptyState>
        : (
          <StructuredList variant="embedded" maxVisibleRows="all" className="wkclaims">
            {page.claims.map((claim) => (
              <StructuredRow
                key={claim.id} data-claim={claim.id} className="wkclaim"
                {...claim.id === arrival ? { rowRef: arrivalRow } : {}}
              >
                <div className="wkclaim-head">
                  {form?.kind === 'revise' && form.claim.id === claim.id
                    ? (
                      <DraftForm canSave={ready !== null} onSave={saveDraft} onCancel={close}>
                        {(invalid) => (
                          <FormInput
                            value={text} aria-label={f.text} aria-invalid={invalid(textMissing)}
                            onChange={(e) => patch({ text: e.target.value })}
                          />
                        )}
                      </DraftForm>
                    )
                    : <span className="wkclaim-text">{claim.text}</span>}
                  {claim.by === HUMAN_PRODUCER ? null : <AgentLabel />}
                  <RowActions>
                    <DotsMenu
                      label={c.actionsLabel(claim.text)}
                      onCloseAutoFocus={(event) => {
                        const next = opening.current
                        opening.current = null
                        if (next === null) return
                        event.preventDefault()
                        open(next)
                      }}
                    >
                      <MenuItem disabled={pending} onSelect={() => { opening.current = { page: page.id, kind: 'revise', claim } }}>
                        {c.revise}
                      </MenuItem>
                      <MenuItem disabled={pending} onSelect={() => { opening.current = { page: page.id, kind: 'conflict', claim } }}>
                        {c.markConflict}
                      </MenuItem>
                      <MenuItem disabled={pending} onSelect={() => retract(claim)}>{c.retract}</MenuItem>
                    </DotsMenu>
                  </RowActions>
                </div>
                <div className="wkclaim-meta">
                  <span className="wkclaim-version">v{claim.version}</span>
                  <span>{fmt.date(claim.since)}</span>
                </div>
                <ul className="wkclaim-lines">
                  {claim.evidence.map((e, at) => (
                    <li key={at} className="wkclaim-evidence"><ClaimSide item={e.evidence} title={e.title} point={e.point} links={links} /></li>
                  ))}
                  {claim.conflicts.map((x) => (
                    <Fragment key={`conflict ${x.id}`}>
                      <li className="wkclaim-conflict">
                        <Tag tone="warn">{c.conflict}</Tag>
                        <ClaimSide item={x.against} title={x.title} point={x.point} links={links} />
                        <span className="wkclaim-note">{x.note}</span>
                        <button
                          type="button" className="btn ghost sm wkclaim-resolve" disabled={pending}
                          onClick={() => open({ page: page.id, kind: 'resolve', claim, conflict: x })}
                        >{c.resolve}</button>
                      </li>
                      {form?.kind === 'resolve' && form.claim.id === claim.id && form.conflict.id === x.id
                        ? (
                          <li className="wkclaim-resolving">
                            <DraftForm
                              destination={outcome === 'split' ? c.heading : undefined}
                              canSave={ready !== null} onSave={saveDraft} onCancel={close}
                            >
                              {(invalid) => (
                                <>
                                  <DraftLine label={f.outcome}>
                                    <ChoicePicker
                                      appearance="field" aria-label={f.outcome} value={outcome}
                                      options={OUTCOMES} label={(o) => f.outcomes[o]}
                                      onPick={(next) => patch({ outcome: next, text: next === 'revised' ? claim.text : '' })}
                                    />
                                  </DraftLine>
                                  {outcome === 'revised' || outcome === 'split'
                                    ? (
                                      <DraftLine label={outcome === 'revised' ? f.revisedText : f.splitText}>
                                        <FormInput
                                          value={text} aria-invalid={invalid(textMissing)}
                                          onChange={(e) => patch({ text: e.target.value })}
                                        />
                                      </DraftLine>
                                    )
                                    : null}
                                  <DraftLine label={f.note}>
                                    <FormInput
                                      value={note} placeholder={f.resolvePlaceholder} aria-invalid={invalid(note.trim() === '')}
                                      onChange={(e) => patch({ note: e.target.value })}
                                    />
                                  </DraftLine>
                                </>
                              )}
                            </DraftForm>
                          </li>
                        )
                        : null}
                    </Fragment>
                  ))}
                  {form?.kind === 'conflict' && form.claim.id === claim.id
                    ? (
                      <li className="wkclaim-marking">
                        <DraftForm canSave={ready !== null} onSave={saveDraft} onCancel={close}>
                          {(invalid) => (
                            <>
                              <DraftLine label={f.other}>
                                {others.length === 0
                                  ? <span className="draft-form-label">{f.noOthers}</span>
                                  : (
                                    <ChoicePicker
                                      appearance="field" aria-label={f.other} placeholder={f.other} value={other}
                                      aria-invalid={invalid(other === '')} options={others.map((x) => x.id)}
                                      label={(id) => others.find((x) => x.id === id)?.text ?? id} onPick={(id) => patch({ other: id })}
                                    />
                                  )}
                              </DraftLine>
                              <DraftLine label={f.note}>
                                <FormInput
                                  value={note} placeholder={f.conflictPlaceholder} aria-invalid={invalid(note.trim() === '')}
                                  onChange={(e) => patch({ note: e.target.value })}
                                />
                              </DraftLine>
                            </>
                          )}
                        </DraftForm>
                      </li>
                    )
                    : null}
                </ul>
                {claim.history.length === 0
                  ? null
                  : (
                    <CardTray variant="row" className="wkclaim-history" summary={c.history} count={claim.history.length}>
                      <DiffLines lines={[
                        ...claim.history.map((h) => `- v${h.version} · ${fmt.date(h.since)} · ${h.text}`),
                        `+ v${claim.version} · ${fmt.date(claim.since)} · ${claim.text}`,
                      ]}
                      />
                    </CardTray>
                  )}
              </StructuredRow>
            ))}
            {addDraft}
          </StructuredList>
        )}
    </>
  )
}
