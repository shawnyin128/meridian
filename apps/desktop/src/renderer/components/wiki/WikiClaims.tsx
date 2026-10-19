import { useEffect, useState } from 'react'
import type {
  ConflictTarget, Evidence, ProjectConclusion, ProjectSummary, ProposalOp, WikiAggregation, WikiClaim, WikiConflict,
} from '../../../shared/contract.js'
import { HUMAN_PRODUCER } from '../../../shared/vocabulary.js'
import { project as projectApi } from '../../ipc.js'
import { useFormat } from '../../lib/format.js'
import { claimId } from '../../lib/slug.js'
import { useMessages } from '../../messages/useMessages.js'
import type { JumpAnchor } from '../../shell/AppShell.js'
import { AddAction } from '../AddAction.js'
import { CardTray } from '../CardTray.js'
import { MenuItem } from '../ActionMenu.js'
import { DiffLines } from '../DiffLines.js'
import { EmptyState } from '../EmptyState.js'
import { ChoicePicker, DotsMenu } from '../FieldPickers.js'
import { FormInput, FormTextarea } from '../FormControls.js'
import { SectionHeading } from '../PageShell.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { AgentLabel } from '../SourceLabel.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { Tag } from '../Tag.js'
import { WikiFormDialog, WikiFormField } from './WikiFormDialog.js'
import { PaperText } from '../paper/PaperText.js'
import './WikiClaims.css'

type Outcome = 'revised' | 'split' | 'retracted' | 'dismissed'
const OUTCOMES: readonly Outcome[] = ['dismissed', 'revised', 'split', 'retracted']

/** The form open over the claims area, if any. */
type Form =
  | { kind: 'add' }
  | { kind: 'revise'; claim: WikiClaim }
  | { kind: 'conflict'; claim: WikiClaim }
  | { kind: 'resolve'; claim: WikiClaim; conflict: WikiConflict }
  | { kind: 'retract'; claim: WikiClaim }

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

/** One evidence item or conflict target as a line of links: what it is, then where it points. */
function Side({ item, title, links }: { item: Evidence | ConflictTarget; title: string | undefined; links: ClaimLinks }) {
  const m = useMessages()
  const c = m.wiki.claims
  const paper = title === undefined ? null : <PaperText text={title} />
  switch (item.kind) {
    case 'experiment':
      return (
        <>
          <Tag>{c.experiment}</Tag>
          <button type="button" className="wkclaim-link" onClick={() => links.openProject(item.project)}>{title}</button>
          <span className="wkclaim-point">{item.node ?? item.conclusion}</span>
          {item.text ? <span className="wkclaim-note">{item.text}</span> : null}
        </>
      )
    case 'source':
      return (
        <>
          <Tag>{c.evidence}</Tag>
          <button
            type="button" className="wkclaim-link"
            onClick={() => links.openReader(item.paper, { page: item.page, ...(item.highlight === undefined ? {} : { highlight: item.highlight }) })}
          >{paper} {c.page(item.page)}</button>
          <q className="wkclaim-quote">{item.quote}</q>
        </>
      )
    case 'note':
      return (
        <>
          <Tag>{c.note}</Tag>
          <button
            type="button" className="wkclaim-link"
            onClick={() => links.openReader(item.paper, item.highlight === undefined ? { panel: 'notes', note: item.note! } : { highlight: item.highlight })}
          >{paper}</button>
        </>
      )
    case 'wiki':
    case 'claim':
      return (
        <>
          {item.kind === 'wiki' ? <Tag>{c.evidence}</Tag> : null}
          <button type="button" className="wkclaim-link" data-wk={item.ref.split('#')[0]} onClick={() => links.openPage(item.ref.split('#')[0]!)}>
            {title}
          </button>
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
 * one titled list of ops and resolves whether it was written.
 */
export function WikiClaims({ page, pending, links, onApply }: {
  page: WikiAggregation
  pending: boolean
  links: ClaimLinks
  onApply: (title: string, ops: ProposalOp[]) => Promise<boolean>
}) {
  const m = useMessages()
  const c = m.wiki.claims
  const f = c.form
  const fmt = useFormat()
  const [form, setForm] = useState<Form | null>(null)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [basis, setBasis] = useState<'personal' | 'conclusion'>('personal')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [conclusions, setConclusions] = useState<ProjectConclusion[]>([])
  const [conclusionId, setConclusionId] = useState('')
  const [other, setOther] = useState('')
  const [outcome, setOutcome] = useState<Outcome>('dismissed')

  const open = (next: Form) => {
    setForm(next)
    setText(next.kind === 'revise' || next.kind === 'resolve' ? next.claim.text : '')
    setNote('')
    setBasis('personal')
    setProjectId('')
    setConclusionId('')
    setOther('')
    setOutcome('dismissed')
  }

  useEffect(() => {
    if (form?.kind !== 'add' || basis !== 'conclusion') return
    void projectApi.list().then(setProjects)
  }, [form, basis])

  useEffect(() => {
    setConclusions([])
    if (projectId === '') return
    void projectApi.get(projectId).then((detail) => setConclusions(
      (detail.projectConclusions ?? []).filter((conclusion) => conclusion.state === 'verified'),
    ))
  }, [projectId])

  const others = form === null || form.kind === 'add' ? [] : page.claims.filter((x) => x.id !== form.claim.id)
  const ids = page.claims.map((x) => x.id)

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
      case 'retract':
        if (note.trim() === '') return null
        return { title: c.proposals.retract(page.title), ops: [
          { op: 'retractClaim', page: page.id, claim: claim!.id, reason: note.trim() },
        ] }
    }
  }

  const ready = submission()

  return (
    <>
      <SectionHeading
        actions={<AddAction variant="section" disabled={pending} title={c.add} onClick={() => open({ kind: 'add' })}>{c.addShort}</AddAction>}
      >{c.heading}
      </SectionHeading>
      {page.claims.length === 0
        ? <EmptyState variant="section">{c.empty}</EmptyState>
        : (
          <StructuredList variant="embedded" maxVisibleRows="all" className="wkclaims">
            {page.claims.map((claim) => (
              <StructuredRow
                key={claim.id} data-claim={claim.id} data-dots-row=""
                className={`wkclaim${claim.conflicts.length > 0 ? ' wkclaim--conflict' : ''}`}
              >
                <div className="wkclaim-head">
                  <span className="wkclaim-text">{claim.text}</span>
                  {claim.by === HUMAN_PRODUCER ? null : <AgentLabel />}
                  <DotsMenu label={c.actionsLabel(claim.text)}>
                    <MenuItem disabled={pending} onSelect={() => open({ kind: 'revise', claim })}>{c.revise}</MenuItem>
                    <MenuItem disabled={pending} onSelect={() => open({ kind: 'conflict', claim })}>{c.markConflict}</MenuItem>
                    <MenuItem disabled={pending} onSelect={() => open({ kind: 'retract', claim })}>{c.retract}</MenuItem>
                  </DotsMenu>
                </div>
                <div className="wkclaim-meta">
                  <span className="wkclaim-version">v{claim.version}</span>
                  <span>{fmt.date(claim.since)}</span>
                </div>
                <ul className="wkclaim-lines">
                  {claim.evidence.map((e, at) => (
                    <li key={at} className="wkclaim-evidence"><Side item={e.evidence} title={e.title} links={links} /></li>
                  ))}
                  {claim.conflicts.map((x) => (
                    <li key={`conflict ${x.id}`} className="wkclaim-conflict">
                      <Tag tone="bad">{c.conflict}</Tag>
                      <Side item={x.against} title={x.title} links={links} />
                      <span className="wkclaim-note">{x.note}</span>
                      <button
                        type="button" className="btn ghost sm wkclaim-resolve" disabled={pending}
                        onClick={() => open({ kind: 'resolve', claim, conflict: x })}
                      >{c.resolve}</button>
                    </li>
                  ))}
                </ul>
                {claim.history.length === 0
                  ? null
                  : (
                    <CardTray variant="row" className="wkclaim-history" summary={c.history(claim.history.length)}>
                      <DiffLines lines={[
                        ...claim.history.map((h) => `- v${h.version} · ${fmt.date(h.since)} · ${h.text}`),
                        `+ v${claim.version} · ${fmt.date(claim.since)} · ${claim.text}`,
                      ]}
                      />
                    </CardTray>
                  )}
              </StructuredRow>
            ))}
          </StructuredList>
        )}

      <WikiFormDialog
        open={form !== null} canSubmit={ready !== null}
        title={form === null ? '' : {
          add: f.addTitle, revise: f.reviseTitle, conflict: f.conflictTitle, resolve: f.resolveTitle, retract: f.retractTitle,
        }[form.kind]}
        onOpenChange={(next) => { if (!next) setForm(null) }}
        onSubmit={() => (ready === null ? Promise.resolve(false) : onApply(ready.title, ready.ops))}
      >
        {form?.kind === 'add' || form?.kind === 'revise'
          ? (
            <WikiFormField label={f.text}>
              <FormTextarea appearance="field" autoFocus value={text} placeholder={f.textPlaceholder} onChange={(e) => setText(e.target.value)} />
            </WikiFormField>
          )
          : null}
        {form?.kind === 'add'
          ? (
            <>
              <WikiFormField label={f.basis}>
                <SegmentedControl
                  label={f.basisLabel} size="sm" value={basis} onChange={setBasis}
                  options={[{ value: 'personal', label: f.personal }, { value: 'conclusion', label: f.conclusion }]}
                />
              </WikiFormField>
              {basis === 'personal'
                ? (
                  <WikiFormField label={f.personal}>
                    <FormInput appearance="field" value={note} placeholder={f.personalPlaceholder} onChange={(e) => setNote(e.target.value)} />
                  </WikiFormField>
                )
                : (
                  <>
                    <WikiFormField label={f.project}>
                      <ChoicePicker
                        appearance="field" aria-label={f.project} placeholder={f.projectPick} value={projectId}
                        options={projects.map((p) => p.id)}
                        label={(id) => projects.find((p) => p.id === id)?.name ?? id}
                        onPick={(id) => { setProjectId(id); setConclusionId('') }}
                      />
                    </WikiFormField>
                    {projectId === ''
                      ? null
                      : conclusions.length === 0
                        ? <p className="wiki-form-hint">{f.noConclusions}</p>
                        : (
                          <WikiFormField label={f.conclusion}>
                            <ChoicePicker
                              appearance="field" aria-label={f.conclusion} placeholder={f.conclusionPick}
                              value={conclusionId} options={conclusions.map((x) => x.id)}
                              label={(id) => conclusions.find((x) => x.id === id)?.text ?? id}
                              onPick={(id) => {
                                setConclusionId(id)
                                const picked = conclusions.find((x) => x.id === id)
                                if (picked !== undefined && text.trim() === '') setText(picked.text)
                              }}
                            />
                          </WikiFormField>
                        )}
                  </>
                )}
            </>
          )
          : null}
        {form?.kind === 'conflict'
          ? (
            <>
              {others.length === 0
                ? <p className="wiki-form-hint">{f.noOthers}</p>
                : (
                  <WikiFormField label={f.other}>
                    <ChoicePicker
                      appearance="field" aria-label={f.other} placeholder={f.other} value={other}
                      options={others.map((x) => x.id)} label={(id) => others.find((x) => x.id === id)?.text ?? id}
                      onPick={setOther}
                    />
                  </WikiFormField>
                )}
              <WikiFormField label={f.note}>
                <FormInput appearance="field" value={note} placeholder={f.conflictPlaceholder} onChange={(e) => setNote(e.target.value)} />
              </WikiFormField>
            </>
          )
          : null}
        {form?.kind === 'resolve'
          ? (
            <>
              <WikiFormField label={f.outcome}>
                <ChoicePicker
                  appearance="field" aria-label={f.outcome} value={outcome}
                  options={OUTCOMES} label={(o) => f.outcomes[o]}
                  onPick={(next) => {
                    setOutcome(next)
                    setText(next === 'revised' ? form.claim.text : '')
                  }}
                />
              </WikiFormField>
              {outcome === 'revised' || outcome === 'split'
                ? (
                  <WikiFormField label={outcome === 'revised' ? f.revisedText : f.splitText}>
                    <FormTextarea appearance="field" value={text} onChange={(e) => setText(e.target.value)} />
                  </WikiFormField>
                )
                : null}
              <WikiFormField label={f.note}>
                <FormInput appearance="field" value={note} placeholder={f.resolvePlaceholder} onChange={(e) => setNote(e.target.value)} />
              </WikiFormField>
            </>
          )
          : null}
        {form?.kind === 'retract'
          ? (
            <WikiFormField label={f.reason}>
              <FormInput appearance="field" autoFocus value={note} placeholder={f.reasonPlaceholder} onChange={(e) => setNote(e.target.value)} />
            </WikiFormField>
          )
          : null}
      </WikiFormDialog>
    </>
  )
}
