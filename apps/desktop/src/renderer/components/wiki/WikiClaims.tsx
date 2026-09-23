import { useEffect, useState } from 'react'
import type {
  Conclusion, ConflictTarget, Evidence, ProjectSummary, ProposalOp, WikiAggregation, WikiClaim, WikiConflict,
} from '../../../shared/contract.js'
import { HUMAN_PRODUCER } from '../../../shared/vocabulary.js'
import { project as projectApi } from '../../ipc.js'
import { useFormat } from '../../lib/format.js'
import { claimId } from '../../lib/slug.js'
import { useMessages } from '../../messages/useMessages.js'
import type { JumpAnchor } from '../../shell/AppShell.js'
import { AddAction } from '../AddAction.js'
import { MenuItem } from '../ActionMenu.js'
import { DiffLines } from '../DiffLines.js'
import { EmptyState } from '../EmptyState.js'
import { DotsMenu } from '../FieldPickers.js'
import { FormInput, FormSelect, FormTextarea } from '../FormControls.js'
import { SectionHeading } from '../PageShell.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { StructuredList, StructuredRow } from '../StructuredList.js'
import { WikiFormDialog, WikiFormField } from './WikiFormDialog.js'
import './WikiClaims.css'

type Outcome = 'revised' | 'split' | 'retracted' | 'dismissed'

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
  switch (item.kind) {
    case 'experiment':
      return (
        <>
          <span className="wkclaim-kind">{c.experiment}</span>
          <button type="button" className="wkclaim-link" onClick={() => links.openProject(item.project)}>{title}</button>
          <span className="wkclaim-point">{item.node ?? item.conclusion}</span>
          {item.text ? <span className="wkclaim-note">{item.text}</span> : null}
        </>
      )
    case 'source':
      return (
        <>
          <span className="wkclaim-kind">{c.evidence}</span>
          <button
            type="button" className="wkclaim-link"
            onClick={() => links.openReader(item.paper, { page: item.page, ...(item.highlight === undefined ? {} : { highlight: item.highlight }) })}
          >{title} {c.page(item.page)}</button>
          <q className="wkclaim-quote">{item.quote}</q>
        </>
      )
    case 'note':
      return (
        <>
          <span className="wkclaim-kind">{c.note}</span>
          <button
            type="button" className="wkclaim-link"
            onClick={() => links.openReader(item.paper, item.highlight === undefined ? { panel: 'notes', note: item.note! } : { highlight: item.highlight })}
          >{title}</button>
        </>
      )
    case 'wiki':
    case 'claim':
      return (
        <>
          {item.kind === 'wiki' ? <span className="wkclaim-kind">{c.evidence}</span> : null}
          <button type="button" className="wkclaim-link" data-wk={item.ref.split('#')[0]} onClick={() => links.openPage(item.ref.split('#')[0]!)}>
            {title}
          </button>
        </>
      )
    case 'personal':
      return (
        <>
          <span className="wkclaim-kind">{c.personal}</span>
          {item.text === '' ? null : <span className="wkclaim-note">{item.text}</span>}
        </>
      )
  }
}

/**
 * The claims area of an aggregation page: each claim with its version, date and author, its evidence
 * (experiments open the project, source quotes open the reader at their page), its open conflicts with
 * the other side linked, and its earlier versions folded away. The user adds, revises, marks and
 * resolves conflicts on, and retracts claims through `onApply`, which submits one titled list of ops
 * and resolves whether it was written.
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
  const [history, setHistory] = useState<ReadonlySet<string>>(new Set())
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [basis, setBasis] = useState<'personal' | 'conclusion'>('personal')
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [conclusions, setConclusions] = useState<Conclusion[]>([])
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
    void projectApi.get(projectId).then((detail) => setConclusions(detail.conclusionList))
  }, [projectId])

  const others = form === null || form.kind === 'add' ? [] : page.claims.filter((x) => x.id !== form.claim.id)
  const ids = page.claims.map((x) => x.id)

  /** The title and ops the open form submits, or null while it is incomplete. */
  const submission = (): { title: string; ops: ProposalOp[] } | null => {
    if (form === null) return null
    const claim = form.kind === 'add' ? null : form.claim
    switch (form.kind) {
      case 'add': {
        if (text.trim() === '' || (basis === 'conclusion' && conclusionId === '')) return null
        const evidence: Evidence[] = basis === 'personal'
          ? [{ kind: 'personal', text: note.trim() }]
          : [{ kind: 'experiment', project: projectId, conclusion: conclusionId }]
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
  const who = (by: string): string => (by === HUMAN_PRODUCER ? c.me : c.agent)
  const toggleHistory = (id: string) => setHistory((shown) => {
    const next = new Set(shown)
    if (!next.delete(id)) next.add(id)
    return next
  })

  return (
    <>
      <SectionHeading variant="content" className="flexh">{c.heading}
        <AddAction variant="section" disabled={pending} title={c.add} onClick={() => open({ kind: 'add' })}>{c.addShort}</AddAction>
      </SectionHeading>
      {page.claims.length === 0
        ? <EmptyState variant="section">{c.empty}</EmptyState>
        : (
          <StructuredList variant="embedded" maxVisibleRows="all" className="wkclaims">
            {page.claims.map((claim) => (
              <StructuredRow
                key={claim.id} data-claim={claim.id}
                className={`wkclaim${claim.conflicts.length > 0 ? ' wkclaim--conflict' : ''}`}
              >
                <div className="wkclaim-head">
                  <span className="wkclaim-text">{claim.text}</span>
                  <DotsMenu label={c.actionsLabel(claim.text)}>
                    <MenuItem disabled={pending} onSelect={() => open({ kind: 'revise', claim })}>{c.revise}</MenuItem>
                    <MenuItem disabled={pending} onSelect={() => open({ kind: 'conflict', claim })}>{c.markConflict}</MenuItem>
                    <MenuItem disabled={pending} onSelect={() => open({ kind: 'retract', claim })}>{c.retract}</MenuItem>
                  </DotsMenu>
                </div>
                <div className="wkclaim-meta">
                  <span className="wkclaim-version">v{claim.version}</span>
                  <span>{fmt.date(claim.since)}</span>
                  <span className={claim.by === HUMAN_PRODUCER ? 'wkclaim-by' : 'wkclaim-by wkclaim-by--agent'}>{who(claim.by)}</span>
                </div>
                <ul className="wkclaim-lines">
                  {claim.evidence.map((e, at) => (
                    <li key={at} className="wkclaim-evidence"><Side item={e.evidence} title={e.title} links={links} /></li>
                  ))}
                  {claim.conflicts.map((x) => (
                    <li key={`conflict ${x.id}`} className="wkclaim-conflict">
                      <span className="wkclaim-kind wkclaim-kind--conflict">{c.conflict}</span>
                      <Side item={x.against} title={x.title} links={links} />
                      <span className="wkclaim-note">{x.note}</span>
                      <button
                        type="button" className="btn plain wkclaim-resolve" disabled={pending}
                        onClick={() => open({ kind: 'resolve', claim, conflict: x })}
                      >{c.resolve}</button>
                    </li>
                  ))}
                </ul>
                {claim.history.length === 0
                  ? null
                  : (
                    <>
                      <button
                        type="button" className="wkclaim-history" aria-expanded={history.has(claim.id)}
                        onClick={() => toggleHistory(claim.id)}
                      >{c.history(claim.history.length)}</button>
                      {history.has(claim.id)
                        ? (
                          <DiffLines lines={[
                            ...claim.history.map((h) => `- v${h.version} · ${fmt.date(h.since)} · ${h.text}`),
                            `+ v${claim.version} · ${fmt.date(claim.since)} · ${claim.text}`,
                          ]}
                          />
                        )
                        : null}
                    </>
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
                      <FormSelect appearance="field" value={projectId} onChange={(e) => { setProjectId(e.target.value); setConclusionId('') }}>
                        <option value="" disabled>{f.projectPick}</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </FormSelect>
                    </WikiFormField>
                    {projectId === ''
                      ? null
                      : conclusions.length === 0
                        ? <p className="wiki-form-hint">{f.noConclusions}</p>
                        : (
                          <WikiFormField label={f.conclusion}>
                            <FormSelect
                              appearance="field" value={conclusionId}
                              onChange={(e) => {
                                setConclusionId(e.target.value)
                                const picked = conclusions.find((x) => x.id === e.target.value)
                                if (picked !== undefined && text.trim() === '') setText(picked.text)
                              }}
                            >
                              <option value="" disabled>{f.conclusionPick}</option>
                              {conclusions.map((x) => <option key={x.id} value={x.id}>{x.text}</option>)}
                            </FormSelect>
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
                    <FormSelect appearance="field" value={other} onChange={(e) => setOther(e.target.value)}>
                      <option value="" disabled>{f.other}</option>
                      {others.map((x) => <option key={x.id} value={x.id}>{x.text}</option>)}
                    </FormSelect>
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
                <FormSelect
                  appearance="field" value={outcome}
                  onChange={(e) => {
                    const next = e.target.value as Outcome
                    setOutcome(next)
                    setText(next === 'revised' ? form.claim.text : '')
                  }}
                >
                  {(['dismissed', 'revised', 'split', 'retracted'] as const).map((o) => <option key={o} value={o}>{f.outcomes[o]}</option>)}
                </FormSelect>
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
