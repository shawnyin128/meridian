import type {
  ConflictTarget, Evidence, PageVersion, SearchHit, WikiAggregation, WikiAggregationCard, WikiCell, WikiClaim,
  WikiHome, WikiPaper, WikiRef,
} from '../../shared/contract.js'

/** One entry from schema.yaml `kinds`. */
export type WikiKindRecord = {
  dir: string
  label: string
  describe: { section: string; hint: string }
  derived_columns?: { key: string; label: string; from_kind: string }[]
}

/** Paper-page frontmatter cell: value plus its source anchor. */
export type WikiCellRecord = { value: string | number | boolean; at: { page: number; quote: string } }

/** Paper membership: target aggregation and table cells keyed by column. */
export type WikiMembershipRecord = { in: string; cells?: Record<string, WikiCellRecord> }

/** Paper page: frontmatter plus body from the closing delimiter to end of file, excluding surrounding whitespace. */
export type WikiPaperRecord = {
  kind: 'paper'
  fm: {
    title: string
    short?: string
    authors?: string[]
    year?: number
    venue?: string
    rating?: number
    identifier?: string
    submitted?: string
    abstract?: string
    pdf?: string
    created?: string
    added_at?: string
    updated: string
    validation_state?: string
    trust_state?: string
    memberships?: WikiMembershipRecord[]
    custom?: Record<string, string | string[]>
  }
  body: string
}

/** One evidence item as a page stores it: the item, then the day and producer that added it. */
export type WikiEvidenceRecord = Evidence & { added: string; by: string }

/** One open conflict as a page stores it. */
export type WikiConflictRecord = { id: string; against: ConflictTarget; note: string; since: string; by: string }

/** One earlier version of a claim. */
export type WikiHistoryRecord = { version: number; text: string; since: string; by: string }

/** One claim as an aggregation page stores it; `conflicts` and `history` are absent when empty. */
export type WikiClaimRecord = {
  id: string
  text: string
  version: number
  since: string
  by: string
  evidence: WikiEvidenceRecord[]
  conflicts?: WikiConflictRecord[]
  history?: WikiHistoryRecord[]
}

/** Aggregation page: frontmatter plus body after the final generated region, excluding surrounding whitespace and generated content. */
export type WikiAggregationRecord = {
  kind: string
  fm: {
    title: string
    aliases?: string[]
    parents?: string[]
    columns?: { key: string; label: string }[]
    split_on?: string | null
    updated: string
    claims?: WikiClaimRecord[]
  }
  body: string
}

/**
 * Entire vault Wiki shaped by schema.yaml and page frontmatter, keyed by page id. `requireQuote`
 * mirrors schema anchor.require_quote and rejects cells without source quotations.
 */
export type WikiData = {
  requireQuote: boolean
  kinds: Record<string, WikiKindRecord>
  sections: { key: string; label: string }[]
  pages: Record<string, WikiPaperRecord | WikiAggregationRecord>
}

/** Returns whether the page is a paper page rather than an aggregation. */
export const isPaper = (page: WikiPaperRecord | WikiAggregationRecord): page is WikiPaperRecord =>
  page.kind === 'paper'

const ids = (data: WikiData): string[] => Object.keys(data.pages).sort()

/** Aggregation page from `data`. Throw when the id is absent or identifies a paper. */
function aggregationOf(data: WikiData, id: string): WikiAggregationRecord {
  const page = data.pages[id]
  if (page === undefined || isPaper(page)) throw new Error(`wiki 聚合不存在:${id}`)
  return page
}

/** Schema kind for an aggregation page. Throw when the schema does not declare it. */
function kindOf(data: WikiData, page: WikiAggregationRecord): WikiKindRecord {
  const kind = data.kinds[page.kind]
  if (kind === undefined) throw new Error(`schema 里没有这种聚合:${page.kind}`)
  return kind
}

const childrenOf = (data: WikiData, id: string): string[] => ids(data).filter((k) => {
  const page = data.pages[k]!
  return !isPaper(page) && (page.fm.parents ?? []).includes(id)
})

const membersOf = (data: WikiData, id: string): string[] => ids(data).filter((k) => {
  const page = data.pages[k]!
  return isPaper(page) && (page.fm.memberships ?? []).some((m) => m.in === id)
})

const shortOf = (page: WikiPaperRecord): string => page.fm.short ?? page.fm.title

/** Full name of a page: its title, or its id when the page is missing. */
export function titleOf(data: WikiData, id: string): string {
  return data.pages[id]?.fm.title ?? id
}

/** Compact name a page goes by in tables and lists: a paper's short title, otherwise its full name. */
export function labelOf(data: WikiData, id: string): string {
  const page = data.pages[id]
  return page !== undefined && isPaper(page) ? shortOf(page) : titleOf(data, id)
}

const ref = (data: WikiData, id: string): WikiRef => {
  const title = labelOf(data, id)
  const full = titleOf(data, id)
  return { id, title, ...(full === title ? {} : { fullTitle: full }) }
}

const cell = (record: WikiCellRecord): WikiCell =>
  ({ value: String(record.value), page: record.at.page, quote: record.at.quote })

/** Generated-region marker line. Body text cannot contain one or the next read would move the body boundary. */
const GENERATED_MARK = /^<!-- (?:generated:\w+|\/generated) -->$/m

/** Throws if `body` holds a generated-region marker line; `id` names the page in the message. */
export function checkBody(id: string, body: string): void {
  if (GENERATED_MARK.test(body)) throw new Error(`正文里不能有生成区的标记:${id}`)
}

/** First non-heading, non-empty body line used as the card summary. */
const summaryOf = (body: string): string =>
  body.split('\n').map((line) => line.trim()).find((line) => line !== '' && !line.startsWith('#')) ?? ''

/** Existing vault pages referenced by body `[[…]]` links, mapped from id to UI name. */
function titlesOf(data: WikiData, body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/\[\[([^\]|\n]+)(?:\|[^\]\n]+)?\]\]/g)) {
    if (data.pages[m[1]!] !== undefined) out[m[1]!] = titleOf(data, m[1]!)
  }
  return out
}

function cardOf(data: WikiData, id: string): WikiAggregationCard {
  const page = aggregationOf(data, id)
  return {
    id,
    kind: page.kind,
    kindLabel: kindOf(data, page).label,
    title: page.fm.title,
    summary: summaryOf(page.body),
    updated: String(page.fm.updated),
    childCount: childrenOf(data, id).length,
    memberCount: membersOf(data, id).length,
    parentCount: (page.fm.parents ?? []).length,
  }
}

/**
 * Returns the wiki home for `data`: the aggregation count, each kind in schema
 * order with its count, and a card for every aggregation without a parent,
 * kinds in schema order and cards in id order.
 */
export function wikiHome(data: WikiData): WikiHome {
  const aggregations = ids(data).filter((id) => !isPaper(data.pages[id]!))
  const kinds = Object.entries(data.kinds).map(([key, kind]) => ({
    key,
    label: kind.label,
    dir: kind.dir,
    count: aggregations.filter((id) => data.pages[id]!.kind === key).length,
  }))
  const roots = Object.keys(data.kinds).flatMap((key) => aggregations
    .filter((id) => {
      const page = data.pages[id] as WikiAggregationRecord
      return page.kind === key && (page.fm.parents ?? []).length === 0
    })
    .map((id) => cardOf(data, id)))
  return { aggregationCount: aggregations.length, kinds, roots }
}

/**
 * Returns the claims stored on aggregation page `page` that this version can read, in page order: a
 * hand-edited or unknown claim shape is left out rather than failing the page.
 */
function readableClaims(page: WikiAggregationRecord): WikiClaimRecord[] {
  const held: unknown = page.fm.claims
  if (!Array.isArray(held)) return []
  return (held as WikiClaimRecord[]).filter((c) => typeof c === 'object' && c !== null
    && typeof c.id === 'string' && typeof c.text === 'string' && typeof c.version === 'number'
    && typeof c.since === 'string' && typeof c.by === 'string' && Array.isArray(c.evidence))
}

/** Returns the readable claims on aggregation `id`, in page order. Throws if `id` is not an aggregation. */
export const claimsOf = (data: WikiData, id: string): WikiClaimRecord[] => readableClaims(aggregationOf(data, id))

/** Returns the readable claim a `<page>#<claim>` ref names, or undefined when the page or the claim is not there. */
export function claimAt(data: WikiData, ref: string): WikiClaimRecord | undefined {
  const [page, claim] = ref.split('#') as [string, string]
  const held = data.pages[page]
  if (held === undefined || isPaper(held)) return undefined
  return readableClaims(held).find((c) => c.id === claim)
}

/**
 * Returns the display name of the other side of a conflict or of an evidence item: the claim's text
 * (the ref itself when the claim is gone), a page's title, a paper's short title, or a project's name
 * from `projects` (its id when unnamed). Personal evidence has none.
 */
function sideTitle(
  data: WikiData, side: Evidence | ConflictTarget, projects: Record<string, string>,
): string | undefined {
  switch (side.kind) {
    case 'claim': return claimAt(data, side.ref)?.text ?? side.ref
    case 'wiki': return side.ref.includes('#') ? claimAt(data, side.ref)?.text ?? side.ref : titleOf(data, side.ref)
    case 'source':
    case 'note': return labelOf(data, side.paper)
    case 'experiment': return projects[side.project] ?? side.project
    case 'personal': return undefined
  }
}

/**
 * Returns the claims of aggregation `id` as the contract shows them, in page order: each evidence item
 * and conflict with its display name resolved (see sideTitle), empty conflict and history lists where the
 * page omits them. `projects` maps project ids to names. Throws if `id` is not an aggregation.
 */
export function wikiClaims(data: WikiData, id: string, projects: Record<string, string>): WikiClaim[] {
  return claimsOf(data, id).map((claim) => ({
    id: claim.id,
    text: claim.text,
    version: claim.version,
    since: claim.since,
    by: claim.by,
    evidence: claim.evidence.map(({ added, by, ...evidence }) => {
      const title = sideTitle(data, evidence, projects)
      return { evidence, added, by, ...(title === undefined ? {} : { title }) }
    }),
    conflicts: (claim.conflicts ?? []).map((c) => ({ ...c, title: sideTitle(data, c.against, projects)! })),
    history: (claim.history ?? []).map((h) => ({ ...h })),
  }))
}

/**
 * Returns, for each conclusion of project `project`, the refs of the claims whose experiment evidence
 * cites it, claims in page id then page order; conclusions no claim cites are absent.
 */
export function conclusionClaims(data: WikiData, project: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const id of ids(data)) {
    const page = data.pages[id]!
    if (isPaper(page)) continue
    for (const claim of readableClaims(page)) {
      for (const e of claim.evidence) {
        if (e.kind !== 'experiment' || e.project !== project || e.conclusion === undefined) continue
        const ref = `${id}#${claim.id}`
        const held = out[e.conclusion] ?? []
        if (!held.includes(ref)) out[e.conclusion] = [...held, ref]
      }
    }
  }
  return out
}

/**
 * Returns every claim whose experiment evidence cites a node or a legacy conclusion of project
 * `project`, once per cited node or conclusion, in page id then page order: the page and its title,
 * the claim id and version, whether it has an open conflict, and the node or conclusion cited.
 */
export function projectClaims(data: WikiData, project: string): {
  page: string; title: string; claim: string; version: number; conflicted: boolean; node?: string; conclusion?: string
}[] {
  return ids(data).flatMap((id) => {
    const page = data.pages[id]!
    if (isPaper(page)) return []
    return readableClaims(page).flatMap((claim) => {
      const seen = new Set<string>()
      return claim.evidence.flatMap((e) => {
        if (e.kind !== 'experiment' || e.project !== project) return []
        const key = JSON.stringify([e.node ?? '', e.conclusion ?? ''])
        if (seen.has(key)) return []
        seen.add(key)
        return [{
          page: id, title: page.fm.title, claim: claim.id, version: claim.version,
          conflicted: (claim.conflicts ?? []).length > 0,
          ...(e.node === undefined ? {} : { node: e.node }),
          ...(e.conclusion === undefined ? {} : { conclusion: e.conclusion }),
        }]
      })
    })
  })
}

/** Returns the node or legacy conclusion of project `project` each open claim conflict is raised against, in page id then page order. */
export function projectDisputes(data: WikiData, project: string): { node?: string; conclusion?: string }[] {
  return ids(data).flatMap((id) => {
    const page = data.pages[id]!
    if (isPaper(page)) return []
    return readableClaims(page).flatMap((claim) => (claim.conflicts ?? []).flatMap(({ against }) => (
      against.kind === 'experiment' && against.project === project
        ? [{
          ...(against.node === undefined ? {} : { node: against.node }),
          ...(against.conclusion === undefined ? {} : { conclusion: against.conclusion }),
        }]
        : []
    )))
  })
}

/**
 * Returns the aggregation `id` in `data` as the contract shows it: aggregationView's fields plus its
 * claims (wikiClaims, with `projects` naming projects) and `version`. Throws if `id` is not an aggregation.
 */
export function wikiAggregation(
  data: WikiData, id: string, version: PageVersion, projects: Record<string, string>,
): WikiAggregation {
  return { ...aggregationView(data, id), claims: wikiClaims(data, id, projects), version }
}

/**
 * Returns the aggregation `id` in `data`: its card, its parents, the cards of
 * its children in id order, its table — one row per member paper in id order,
 * cells keyed by the aggregation's columns (a cell whose key is not a column
 * is dropped), derived columns filled from the paper's memberships of the
 * derived kind in the paper's own order — for every other kind the
 * aggregations its members also belong to in id order, its body, and the
 * names of the pages its body links to. Throws if `id` is not an aggregation.
 */
export function aggregationView(data: WikiData, id: string): Omit<WikiAggregation, 'claims' | 'version'> {
  const page = aggregationOf(data, id)
  const kind = kindOf(data, page)
  const columns = (page.fm.columns ?? []).map((c) => ({ key: c.key, label: c.label }))
  const derivedColumns = (kind.derived_columns ?? []).map((d) => ({ key: d.key, label: d.label }))
  const members = membersOf(data, id)
  const membershipsOf = (pid: string): WikiMembershipRecord[] =>
    (data.pages[pid] as WikiPaperRecord).fm.memberships ?? []
  const rows = members.map((pid) => {
    const membership = membershipsOf(pid).find((m) => m.in === id)!
    return {
      paper: ref(data, pid),
      cells: Object.fromEntries(columns.flatMap((c) => {
        const record = membership.cells?.[c.key]
        return record === undefined ? [] : [[c.key, cell(record)] as const]
      })),
      derived: Object.fromEntries((kind.derived_columns ?? []).map((d) => [
        d.key,
        membershipsOf(pid).filter((m) => data.pages[m.in]?.kind === d.from_kind).map((m) => ref(data, m.in)),
      ])),
    }
  })
  const related = Object.keys(data.kinds).filter((k) => k !== page.kind).flatMap((k) => {
    const linked = [...new Set(members.flatMap((pid) =>
      membershipsOf(pid).map((m) => m.in).filter((target) => data.pages[target]?.kind === k)))].sort()
    return linked.length === 0
      ? []
      : [{ label: data.kinds[k]!.label, links: linked.map((target) => ref(data, target)) }]
  })
  return {
    ...cardOf(data, id),
    parents: (page.fm.parents ?? []).map((p) => ref(data, p)),
    ...(page.fm.split_on ? { splitOn: page.fm.split_on } : {}),
    children: childrenOf(data, id).map((c) => cardOf(data, c)),
    columns,
    derivedColumns,
    rows,
    related,
    body: page.body,
    titles: titlesOf(data, page.body),
  }
}

/**
 * Returns the paper page `id` in `data`: what its frontmatter holds, its body,
 * the names of the pages its body links to, and one membership per aggregation
 * it belongs to — in the paper's own order, cells in the paper's own order,
 * labelled by the aggregation's columns, a membership in an aggregation the
 * data does not hold dropped — and `version`. Throws if `id` is not a paper page.
 */
export function wikiPaper(data: WikiData, id: string, version: PageVersion): WikiPaper {
  const page = data.pages[id]
  if (page === undefined || !isPaper(page)) throw new Error(`wiki 论文页不存在:${id}`)
  const memberships = (page.fm.memberships ?? []).flatMap((m) => {
    const aggregation = data.pages[m.in]
    if (aggregation === undefined || isPaper(aggregation)) return []
    const labels = new Map((aggregation.fm.columns ?? []).map((c) => [c.key, c.label]))
    return [{
      aggregation: ref(data, m.in),
      kind: aggregation.kind,
      kindLabel: kindOf(data, aggregation).label,
      cells: Object.entries(m.cells ?? {}).map(([key, record]) => ({ label: labels.get(key) ?? key, cell: cell(record) })),
    }]
  })
  return {
    id,
    title: page.fm.title,
    short: shortOf(page),
    authors: [...(page.fm.authors ?? [])],
    ...(page.fm.year === undefined ? {} : { year: page.fm.year }),
    venue: page.fm.venue ?? '',
    pdf: page.fm.pdf ?? '',
    updated: String(page.fm.updated),
    body: page.body,
    titles: titlesOf(data, page.body),
    memberships,
    version,
  }
}

/**
 * Returns one search hit per aggregation in `data`, kinds in schema order and
 * aggregations in id order: the target is the page id, the title is the kind's
 * label, a colon, and the aggregation's title.
 */
export function wikiSearchIndex(data: WikiData): SearchHit[] {
  return Object.entries(data.kinds).flatMap(([key, kind]) => ids(data)
    .filter((id) => data.pages[id]!.kind === key)
    .map((id): SearchHit => ({
      kind: 'aggregation',
      target: id,
      title: `${kind.label}:${(data.pages[id] as WikiAggregationRecord).fm.title}`,
      meta: 'Wiki',
    })))
}

/**
 * Returns a card for every aggregation in `data`, kinds in schema order and
 * aggregations in id order — the same order `wikiSearchIndex` lists them.
 */
export function wikiCards(data: WikiData): WikiAggregationCard[] {
  return Object.keys(data.kinds).flatMap((key) => ids(data)
    .filter((id) => data.pages[id]!.kind === key)
    .map((id) => cardOf(data, id)))
}
