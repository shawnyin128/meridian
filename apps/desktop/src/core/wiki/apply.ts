import type { ClaimOp, ConflictTarget, Evidence, ProposalOp } from '../../shared/contract.js'
import { CLAIM_OPS } from '../../shared/contract.js'
import { HUMAN_PRODUCER } from '../../shared/vocabulary.js'
import type {
  WikiAggregationRecord, WikiCellRecord, WikiClaimRecord, WikiConflictRecord, WikiData, WikiEvidenceRecord,
  WikiMembershipRecord, WikiPaperRecord,
} from './model.js'
import { claimAt, isPaper } from './model.js'

/** The `by` Core stamps for a write the user made in the app. */
export const HUMAN = HUMAN_PRODUCER

/**
 * What claim validation needs beyond the Wiki: the producer stamped as `by` (HUMAN, or `ai:<id>`), the
 * nodes and conclusions of a project (undefined when there is no such project), and the highlight and
 * note ids of a paper's reading record, by paper page id.
 */
export type ClaimWorld = {
  by: string
  project: (id: string) => { nodes: string[]; conclusions: string[] } | undefined
  reading: (paper: string) => { highlights: string[]; notes: string[] }
}

/** A world in which the user writes and no project or reading record exists. */
const HUMAN_WORLD: ClaimWorld = {
  by: HUMAN, project: () => undefined, reading: () => ({ highlights: [], notes: [] }),
}

/** Returns the line one entry takes in an append section: date, separator, text. */
export const entryLine = (date: string, text: string): string => `- ${date} · ${text}`

/** Returns whether `op` acts on claims. */
export const isClaimOp = (op: ProposalOp): op is ClaimOp => (CLAIM_OPS as readonly string[]).includes(op.op)

/** Page id of a `<page>#<claim>` ref. */
const pageOfRef = (ref: string): string => ref.split('#')[0]!

/**
 * Returns the id of every page applying `ops` to `data` writes, in the order the ops first touch each:
 * the paper of a membership op, the id a create op makes, the page of every other op, the page of the
 * claim a markConflict names as its target, and the page holding the other side of a conflict a
 * resolveConflict closes.
 */
export function touchedPages(proposal: { ops: ProposalOp[] }, data: WikiData): string[] {
  const out: string[] = []
  const add = (id: string): void => { if (!out.includes(id)) out.push(id) }
  for (const op of proposal.ops) {
    add(op.op === 'setMembership' || op.op === 'removeMembership' ? op.paper
      : op.op === 'createAggregation' ? op.id : op.page)
    if (op.op === 'markConflict' && op.conflict.against.kind === 'claim') add(pageOfRef(op.conflict.against.ref))
    if (op.op === 'resolveConflict') {
      const against = claimAt(data, `${op.page}#${op.claim}`)?.conflicts?.find((c) => c.id === op.conflict)?.against
      if (against?.kind === 'claim') add(pageOfRef(against.ref))
    }
  }
  return out
}

/**
 * Returns the pages `ops` name (write protocol §2.1), in first-named order: `paper`, `in`, `page`, a
 * create's `id`, and the page part of a claim ref in `against` or in `wiki` evidence.
 */
export function namedPages(ops: ProposalOp[]): string[] {
  const out: string[] = []
  const add = (id: string): void => { if (!out.includes(id)) out.push(id) }
  for (const op of ops) {
    if (op.op === 'setMembership' || op.op === 'removeMembership') {
      add(op.paper)
      add(op.in)
      continue
    }
    add(op.op === 'createAggregation' ? op.id : op.page)
    if (op.op === 'markConflict' && op.conflict.against.kind === 'claim') add(pageOfRef(op.conflict.against.ref))
    const evidence = op.op === 'addClaim' ? op.claim.evidence
      : op.op === 'reviseClaim' || op.op === 'addEvidence' ? op.evidence ?? [] : []
    for (const e of evidence) if (e.kind === 'wiki') add(pageOfRef(e.ref))
  }
  return out
}

/** Short text for the other side of a conflict in a describeOp line. */
const againstText = (against: ConflictTarget): string =>
  against.kind === 'claim' ? against.ref
    : against.kind === 'source' ? `${against.paper} p.${against.page}`
      : `实验 ${against.project} ${against.node ?? against.conclusion ?? ''}`.trimEnd()

/**
 * Returns the one-line diff the change log and the review list show for `op`; reviseClaim and
 * retractClaim read the claim's current version and text from `data` (`?` and an empty text when the
 * claim is not there).
 */
export function describeOp(op: ProposalOp, data: WikiData): string {
  switch (op.op) {
    case 'createAggregation': return `+ ${op.id} 新建(${op.kind})`
    case 'setMembership': return `+ ${op.paper} ∈ ${op.in}(${Object.keys(op.cells).length} 格)`
    case 'removeMembership': return `- ${op.paper} ∈ ${op.in}`
    case 'appendEntry': return `+ ${op.page} § ${op.section}:${op.text}`
    case 'setColumns': return `~ ${op.page} 列:${op.columns.map((c) => c.key).join(',')}`
    case 'setParents': return `~ ${op.page} 属于:${op.parents.join(',')}`
    case 'setAggregationMetadata': return `~ ${op.page} 元数据:${op.title}`
    case 'addClaim': return `+ ${op.page}#${op.claim.id}:${op.claim.text}`
    case 'reviseClaim': {
      const version = claimAt(data, `${op.page}#${op.claim}`)?.version
      return `~ ${op.page}#${op.claim} v${version ?? '?'}→v${version === undefined ? '?' : version + 1}:${op.text}`
    }
    case 'addEvidence': return `+ ${op.page}#${op.claim} 证据 ×${op.evidence.length}`
    case 'markConflict': return `~ ${op.page}#${op.claim} 冲突 ${againstText(op.conflict.against)}`
    case 'resolveConflict': return `~ ${op.page}#${op.claim} 冲突 ${op.conflict} 已处理(${op.outcome})`
    case 'retractClaim': return `- ${op.page}#${op.claim}:${claimAt(data, `${op.page}#${op.claim}`)?.text ?? ''}`
  }
}

/**
 * Returns a source quote as quote verification and duplicate checks compare it: NFKC, soft hyphens
 * removed, a hyphen plus whitespace between letters joined, whitespace runs collapsed to one space,
 * trimmed, lowercase.
 */
export const normalizeQuote = (text: string): string => text.normalize('NFKC')
  .replace(/­/g, '')
  .replace(/(\p{L})-\s+(\p{L})/gu, '$1$2')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

/** What makes two evidence items the same item (write protocol §4.2). */
function identity(e: Evidence): string {
  switch (e.kind) {
    case 'source': return JSON.stringify([e.kind, e.paper, e.page, normalizeQuote(e.quote)])
    case 'wiki': return JSON.stringify([e.kind, e.ref])
    case 'experiment': return JSON.stringify([e.kind, e.project, e.node ?? '', e.conclusion ?? ''])
    case 'note': return JSON.stringify([e.kind, e.paper, e.highlight ?? '', e.note ?? ''])
    case 'personal': return JSON.stringify([e.kind, e.text])
  }
}

/** Field order a stored evidence item or conflict target is written in, after `kind`. */
const FIELDS: Record<Evidence['kind'] | ConflictTarget['kind'], string[]> = {
  source: ['paper', 'page', 'quote', 'highlight'],
  wiki: ['ref'],
  experiment: ['project', 'node', 'conclusion', 'text'],
  note: ['paper', 'highlight', 'note'],
  personal: ['text'],
  claim: ['ref'],
}

/** Returns `item` with `kind` first and its present fields in FIELDS order. */
function ordered<T extends Evidence | ConflictTarget>(item: T): T {
  const out: Record<string, unknown> = { kind: item.kind }
  for (const key of FIELDS[item.kind]) {
    const value = (item as Record<string, unknown>)[key]
    if (value !== undefined) out[key] = value
  }
  return out as T
}

/** Throws unless the text holds no line break; `what` names it in the message. */
function oneLine(text: string, what: string): void {
  if (/[\r\n]/.test(text)) throw new Error(`${what}一行写完,不能有换行`)
}

/** Throws unless no string field of an evidence item or conflict target holds a line break. */
function oneLineFields(item: Evidence | ConflictTarget): void {
  for (const [key, value] of Object.entries(item)) if (typeof value === 'string') oneLine(value, `证据的 ${key} `)
}

/** The fields of `claim` this version does not know, kept as written. */
function unknownFields(claim: WikiClaimRecord): Record<string, unknown> {
  const known = ['id', 'text', 'version', 'since', 'by', 'evidence', 'conflicts', 'history']
  return Object.fromEntries(Object.entries(claim).filter(([key]) => !known.includes(key)))
}

/** Throws unless an experiment item names a node or a conclusion of a project `world` knows, and those exist. */
function checkExperiment(e: Extract<Evidence, { kind: 'experiment' }>, world: ClaimWorld): void {
  if (e.node === undefined && e.conclusion === undefined) throw new Error('实验证据要指明节点或结论')
  const project = world.project(e.project)
  if (project === undefined) throw new Error(`项目不存在:${e.project}`)
  if (e.node !== undefined && !project.nodes.includes(e.node)) throw new Error(`项目 ${e.project} 里没有节点:${e.node}`)
  if (e.conclusion !== undefined && !project.conclusions.includes(e.conclusion)) {
    throw new Error(`项目 ${e.project} 里没有结论:${e.conclusion}`)
  }
}

/**
 * Throws unless every item of `items` passes write protocol §4.3 as far as the Wiki and `world` can tell
 * (quote verification against the PDF happens elsewhere), and none is the same item as another of
 * `items` or as one of `held`.
 */
function checkEvidence(data: WikiData, items: Evidence[], world: ClaimWorld, held: Evidence[]): void {
  const seen = new Set(held.map(identity))
  for (const e of items) {
    oneLineFields(e)
    if (e.kind === 'source') paperOf(data, e.paper)
    if (e.kind === 'wiki' && (e.ref.includes('#') ? claimAt(data, e.ref) : data.pages[e.ref]) === undefined) {
      throw new Error(`证据指向的页或结论不存在:${e.ref}`)
    }
    if (e.kind === 'experiment') checkExperiment(e, world)
    if (e.kind === 'note') {
      paperOf(data, e.paper)
      if ((e.highlight === undefined) === (e.note === undefined)) throw new Error('笔记证据要指明一条高亮或一条笔记,只能指一个')
      const reading = world.reading(e.paper)
      const found = e.highlight !== undefined ? reading.highlights.includes(e.highlight) : reading.notes.includes(e.note!)
      if (!found) throw new Error(`${e.paper} 的阅读记录里没有这一条:${e.highlight ?? e.note}`)
    }
    if (e.kind === 'personal' && world.by !== HUMAN) throw new Error('只有「我」能写个人判断')
    const key = identity(e)
    if (seen.has(key)) throw new Error('证据已经在这条结论上了')
    seen.add(key)
  }
}

/** Throws when a producer other than the user gives no experiment item: only a project's finding may become an agent's claim. */
function requireExperiment(items: Evidence[], world: ClaimWorld): void {
  if (world.by !== HUMAN && !items.some((e) => e.kind === 'experiment')) {
    throw new Error('agent 提的结论要带实验证据:只有项目实际得到的结论才能写进 Wiki')
  }
}

/** The claim `claim` on aggregation `page` (id `pageId`). Throw when it is not there. */
function claimIn(page: WikiAggregationRecord, pageId: string, claim: string): WikiClaimRecord {
  const found = (page.fm.claims ?? []).find((c) => c.id === claim)
  if (found === undefined) throw new Error(`结论不存在:${pageId}#${claim}`)
  return found
}

/** `page` with its claims replaced by `claims` and stamped updated `today`. */
const withClaims = (page: WikiAggregationRecord, claims: WikiClaimRecord[], today: string): WikiAggregationRecord =>
  ({ ...page, fm: { ...page.fm, updated: today, claims } })

/** `claim` with its conflicts replaced by `conflicts`, the key dropped when none are left. */
function withConflicts(claim: WikiClaimRecord, conflicts: WikiConflictRecord[]): WikiClaimRecord {
  return {
    id: claim.id, text: claim.text, version: claim.version, since: claim.since, by: claim.by, evidence: claim.evidence,
    ...(conflicts.length === 0 ? {} : { conflicts }),
    ...(claim.history === undefined ? {} : { history: claim.history }),
    ...unknownFields(claim),
  }
}

/** `pages` with claim `ref` replaced by what `change` makes of it; the page is stamped updated `today`. */
function changeClaim(
  pages: WikiData['pages'], ref: string, today: string, change: (claim: WikiClaimRecord) => WikiClaimRecord,
): void {
  const pageId = pageOfRef(ref)
  const page = pages[pageId] as WikiAggregationRecord
  pages[pageId] = withClaims(page, (page.fm.claims ?? []).map((c) => (`${pageId}#${c.id}` === ref ? change(c) : c)), today)
}

/** Aggregation page from `data`. Throw when the id is absent or identifies a paper. */
function aggregationOf(data: WikiData, id: string): WikiAggregationRecord {
  const page = data.pages[id]
  if (page === undefined || isPaper(page)) throw new Error(`wiki 聚合不存在:${id}`)
  return page
}

/** Paper page from `data`. Throw when the id is absent or is not a paper. */
function paperOf(data: WikiData, id: string): WikiPaperRecord {
  const page = data.pages[id]
  if (page === undefined || !isPaper(page)) throw new Error(`wiki 论文页不存在:${id}`)
  return page
}

/** Whether following parents upward from `from` reaches `target`. */
function reaches(data: WikiData, from: string, target: string, seen = new Set<string>()): boolean {
  if (from === target) return true
  if (seen.has(from)) return false
  seen.add(from)
  const page = data.pages[from]
  if (page === undefined || isPaper(page)) return false
  return (page.fm.parents ?? []).some((parent) => reaches(data, parent, target, seen))
}

/** Throw when column keys are duplicated. */
function checkColumns(columns: { key: string }[]): void {
  const seen = new Set<string>()
  for (const { key } of columns) {
    if (seen.has(key)) throw new Error(`列键重复:${key}`)
    seen.add(key)
  }
}

/** A stored evidence item: `e` in FIELDS order, stamped with the day and producer. */
const evidenceRecord = (e: Evidence, today: string, by: string): WikiEvidenceRecord => ({ ...ordered(e), added: today, by })

/**
 * Data after one operation. `ops` is the whole proposal, which resolveConflict's outcome rules look
 * through. Throw when the operation is invalid for `data`.
 */
function step(data: WikiData, op: ProposalOp, today: string, ops: ProposalOp[], world: ClaimWorld): WikiData {
  const pages = { ...data.pages }
  switch (op.op) {
    case 'addClaim': {
      const page = aggregationOf(data, op.page)
      const claims = page.fm.claims ?? []
      if (claims.some((c) => c.id === op.claim.id)) throw new Error(`这一页上已经有这个结论 id:${op.page}#${op.claim.id}`)
      oneLine(op.claim.text, '结论')
      checkEvidence(data, op.claim.evidence, world, [])
      requireExperiment(op.claim.evidence, world)
      pages[op.page] = withClaims(page, [...claims, {
        id: op.claim.id, text: op.claim.text, version: 1, since: today, by: world.by,
        evidence: op.claim.evidence.map((e) => evidenceRecord(e, today, world.by)),
      }], today)
      return { ...data, pages }
    }
    case 'reviseClaim': {
      const claim = claimIn(aggregationOf(data, op.page), op.page, op.claim)
      oneLine(op.text, '结论')
      if (op.text === claim.text) throw new Error(`新写法与现在的一样:${op.page}#${op.claim}`)
      const given = op.evidence ?? []
      checkEvidence(data, given, world, claim.evidence)
      requireExperiment(given, world)
      changeClaim(pages, `${op.page}#${op.claim}`, today, () => ({
        id: claim.id, text: op.text, version: claim.version + 1, since: today, by: world.by,
        evidence: [...claim.evidence, ...given.map((e) => evidenceRecord(e, today, world.by))],
        ...(claim.conflicts === undefined ? {} : { conflicts: claim.conflicts }),
        history: [...claim.history ?? [], { version: claim.version, text: claim.text, since: claim.since, by: claim.by }],
        ...unknownFields(claim),
      }))
      return { ...data, pages }
    }
    case 'addEvidence': {
      const claim = claimIn(aggregationOf(data, op.page), op.page, op.claim)
      checkEvidence(data, op.evidence, world, claim.evidence)
      changeClaim(pages, `${op.page}#${op.claim}`, today, (c) => ({
        ...c, evidence: [...c.evidence, ...op.evidence.map((e) => evidenceRecord(e, today, world.by))],
      }))
      return { ...data, pages }
    }
    case 'markConflict': {
      const self = `${op.page}#${op.claim}`
      const claim = claimIn(aggregationOf(data, op.page), op.page, op.claim)
      const { id, against, note } = op.conflict
      oneLine(note, '冲突说明')
      oneLineFields(against)
      if ((claim.conflicts ?? []).some((c) => c.id === id)) throw new Error(`这条结论上已经有冲突 ${id}:${self}`)
      if (against.kind === 'claim') {
        if (against.ref === self) throw new Error(`结论不能与自己冲突:${self}`)
        const other = claimAt(data, against.ref)
        if (other === undefined) throw new Error(`冲突指向的结论不存在:${against.ref}`)
        if ((other.conflicts ?? []).some((c) => c.id === id)) throw new Error(`${against.ref} 上已经有冲突 ${id}`)
      } else if (against.kind === 'source') {
        paperOf(data, against.paper)
      } else {
        checkExperiment(against, world)
      }
      const add = (target: ConflictTarget) => (c: WikiClaimRecord): WikiClaimRecord =>
        withConflicts(c, [...c.conflicts ?? [], { id, against: ordered(target), note, since: today, by: world.by }])
      changeClaim(pages, self, today, add(against))
      if (against.kind === 'claim') changeClaim(pages, against.ref, today, add({ kind: 'claim', ref: self }))
      return { ...data, pages }
    }
    case 'resolveConflict': {
      const self = `${op.page}#${op.claim}`
      const claim = claimIn(aggregationOf(data, op.page), op.page, op.claim)
      const conflict = (claim.conflicts ?? []).find((c) => c.id === op.conflict)
      if (conflict === undefined) throw new Error(`这条结论上没有冲突 ${op.conflict}:${self}`)
      oneLine(op.note, '处理说明')
      const pair = [self, ...(conflict.against.kind === 'claim' ? [conflict.against.ref] : [])]
      const inPair = (o: ProposalOp): boolean => 'claim' in o && typeof o.claim === 'string' && pair.includes(`${o.page}#${o.claim}`)
      if (op.outcome === 'revised' && !ops.some((o) => o.op === 'reviseClaim' && inPair(o))) {
        throw new Error('「已修订」要在同一个提案里修订冲突中的一条结论')
      }
      if (op.outcome === 'split' && !ops.some((o) => o.op === 'addClaim' && pair.some((ref) => pageOfRef(ref) === o.page))) {
        throw new Error('「已拆分」要在同一个提案里,在冲突结论所在的页上新增一条结论')
      }
      if (op.outcome === 'retracted' && !ops.some((o) => o.op === 'retractClaim' && inPair(o))) {
        throw new Error('「已撤回」要在同一个提案里撤回冲突中的一条结论')
      }
      changeClaim(pages, self, today, (c) => withConflicts(c, (c.conflicts ?? []).filter((x) => x.id !== op.conflict)))
      const other = conflict.against.kind === 'claim' ? conflict.against.ref : null
      if (other !== null && claimAt({ ...data, pages }, other) !== undefined) {
        changeClaim(pages, other, today, (c) => withConflicts(c, (c.conflicts ?? []).filter((x) =>
          !(x.id === op.conflict && x.against.kind === 'claim' && x.against.ref === self))))
      }
      return { ...data, pages }
    }
    case 'retractClaim': {
      const page = aggregationOf(data, op.page)
      const claim = claimIn(page, op.page, op.claim)
      oneLine(op.reason, '撤回理由')
      if ((claim.conflicts ?? []).length > 0) throw new Error(`先处理这条结论上的冲突,再撤回:${op.page}#${op.claim}`)
      pages[op.page] = withClaims(page, (page.fm.claims ?? []).filter((c) => c.id !== op.claim), today)
      return { ...data, pages }
    }
    case 'createAggregation': {
      const kind = data.kinds[op.kind]
      if (kind === undefined) throw new Error(`schema 里没有这种聚合:${op.kind}`)
      if (!op.id.startsWith(`${kind.dir}/`)) throw new Error(`${op.kind} 的页要在 ${kind.dir}/ 下:${op.id}`)
      const slug = op.id.slice(kind.dir.length + 1)
      if (!/^[\p{L}\p{N}._-]+$/u.test(slug) || slug === '.' || slug === '..') {
        throw new Error(`聚合的 id 只能是目录下的一个文件名:${op.id}`)
      }
      if (pages[op.id] !== undefined) throw new Error(`页已经存在:${op.id}`)
      for (const parent of op.parents) {
        if (aggregationOf(data, parent).kind !== op.kind) throw new Error(`父聚合不是同一种:${parent}`)
      }
      checkColumns(op.columns)
      pages[op.id] = {
        kind: op.kind,
        fm: {
          title: op.title,
          aliases: [],
          parents: [...op.parents],
          columns: op.columns.map((c) => ({ ...c })),
          ...(op.splitOn === undefined ? {} : { split_on: op.splitOn }),
          updated: today,
        },
        body: [
          `## ${kind.describe.section}`, op.describe, '',
          ...data.sections.flatMap((s) => [`## ${s.label}`, '']),
        ].join('\n').trim(),
      }
      return { ...data, pages }
    }
    case 'setAggregationMetadata': {
      const page = aggregationOf(data, op.page)
      const front = { ...page.fm }
      delete front.split_on
      pages[op.page] = {
        ...page,
        fm: {
          ...front,
          title: op.title,
          ...(op.splitOn === null ? {} : { split_on: op.splitOn }),
          updated: today,
        },
      }
      return { ...data, pages }
    }
    case 'setMembership': {
      const paper = paperOf(data, op.paper)
      const target = aggregationOf(data, op.in)
      const columns = new Set((target.fm.columns ?? []).map((c) => c.key))
      const cells: Record<string, WikiCellRecord> = {}
      for (const [key, cell] of Object.entries(op.cells)) {
        if (!columns.has(key)) throw new Error(`格子的键不在 ${op.in} 的列里:${key}`)
        if (data.requireQuote && cell.quote === '') throw new Error(`格子没有原文引句:${op.in}.${key}`)
        cells[key] = { value: cell.value, at: { page: cell.page, quote: cell.quote } }
      }
      const membership: WikiMembershipRecord = { in: op.in, cells }
      const held = paper.fm.memberships ?? []
      const memberships = held.some((m) => m.in === op.in)
        ? held.map((m) => (m.in === op.in ? membership : m))
        : [...held, membership]
      pages[op.paper] = { ...paper, fm: { ...paper.fm, updated: today, memberships } }
      return { ...data, pages }
    }
    case 'removeMembership': {
      const paper = paperOf(data, op.paper)
      const held = paper.fm.memberships ?? []
      if (!held.some((m) => m.in === op.in)) throw new Error(`${op.paper} 不属于 ${op.in}`)
      pages[op.paper] = {
        ...paper, fm: { ...paper.fm, updated: today, memberships: held.filter((m) => m.in !== op.in) },
      }
      return { ...data, pages }
    }
    case 'appendEntry': {
      const page = aggregationOf(data, op.page)
      if (!data.sections.some((s) => s.label === op.section)) throw new Error(`schema 里没有这个追加区:${op.section}`)
      if (op.text.includes('\n')) throw new Error('追加区一条占一行,正文里不能有换行')
      // Match wiki/page.ts appendEntry placement: after the section's last non-empty line, or directly below an empty heading.
      const lines = page.body.split('\n')
      const heading = lines.indexOf(`## ${op.section}`)
      if (heading < 0) throw new Error(`页上没有「${op.section}」这一节:${op.page}`)
      let end = heading + 1
      while (end < lines.length && !lines[end]!.startsWith('## ')) end += 1
      let last = end - 1
      while (last > heading && lines[last]!.trim() === '') last -= 1
      lines.splice(last + 1, 0, entryLine(op.date, op.text))
      pages[op.page] = { ...page, fm: { ...page.fm, updated: today }, body: lines.join('\n') }
      return { ...data, pages }
    }
    case 'setColumns': {
      const page = aggregationOf(data, op.page)
      checkColumns(op.columns)
      const keys = new Set(op.columns.map((c) => c.key))
      for (const [id, other] of Object.entries(data.pages)) {
        if (!isPaper(other)) continue
        for (const m of other.fm.memberships ?? []) {
          if (m.in !== op.page) continue
          for (const key of Object.keys(m.cells ?? {})) {
            if (!keys.has(key)) throw new Error(`${id} 在 ${op.page} 里填过的格子 ${key} 不在新的列里`)
          }
        }
      }
      pages[op.page] = {
        ...page, fm: { ...page.fm, updated: today, columns: op.columns.map((c) => ({ ...c })) },
      }
      return { ...data, pages }
    }
    case 'setParents': {
      const page = aggregationOf(data, op.page)
      if (new Set(op.parents).size !== op.parents.length) throw new Error(`父聚合重复:${op.page}`)
      for (const parent of op.parents) {
        if (parent === op.page) throw new Error(`聚合不能挂在自己下面:${op.page}`)
        if (aggregationOf(data, parent).kind !== page.kind) throw new Error(`父聚合不是同一种:${parent}`)
        if (reaches(data, parent, op.page)) throw new Error(`挂到 ${parent} 下会成环:${op.page}`)
      }
      pages[op.page] = { ...page, fm: { ...page.fm, updated: today, parents: [...op.parents] } }
      return { ...data, pages }
    }
  }
}

/**
 * Returns the data a proposal leaves behind when applied to `data`, op by op
 * in order, each op seeing the effect of the ones before it; every page an op
 * writes is stamped updated `today`. `data` is not modified. Throws on the
 * first op that is not valid against the data as it stands then: an
 * undeclared kind, a page id outside its kind's directory or not a single file
 * name or already taken, a missing or other-kind parent, a duplicate column
 * key, a paper or aggregation that does not exist, a cell keyed to no column,
 * an empty quote where the schema requires one, a membership that is not
 * there, a section the schema does not declare or the page does not carry, an
 * entry with a line break, a column set that drops a cell a member already
 * filled, or a parent that is not an aggregation of the same kind, the page
 * itself, a duplicate, or one that would make a cycle. Claim ops (write
 * protocol §2.4, without moveClaim) stamp `since`, `added` and `by` from
 * `today` and `world.by`, and throw when the page is not an aggregation, the
 * claim, conflict or claim id is missing or already taken, a text holds a line
 * break, a revision leaves the text as it is, an evidence item or conflict
 * target fails §4.3 as far as the Wiki and `world` tell or repeats one already
 * there, a producer other than HUMAN gives personal evidence or an addClaim or
 * reviseClaim without experiment evidence, a claim would conflict with itself
 * or twice under one id, a resolveConflict outcome lacks the op it requires in
 * the same proposal, or a claim with open conflicts is retracted.
 */
export function applyProposal(
  data: WikiData, proposal: { ops: ProposalOp[] }, today: string, world: ClaimWorld = HUMAN_WORLD,
): WikiData {
  return proposal.ops.reduce((next, op) => step(next, op, today, proposal.ops, world), data)
}
