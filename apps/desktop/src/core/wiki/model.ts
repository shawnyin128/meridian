import type {
  SearchHit, WikiAggregation, WikiAggregationCard, WikiCell, WikiHome, WikiPaper, WikiRef,
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
function titleOf(data: WikiData, id: string): string {
  return data.pages[id]?.fm.title ?? id
}

/** Compact name a page goes by in tables and lists: a paper's short title, otherwise its full name. */
function labelOf(data: WikiData, id: string): string {
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
 * Returns the aggregation `id` in `data`: its card, its parents, the cards of
 * its children in id order, its table — one row per member paper in id order,
 * cells keyed by the aggregation's columns (a cell whose key is not a column
 * is dropped), derived columns filled from the paper's memberships of the
 * derived kind in the paper's own order — for every other kind the
 * aggregations its members also belong to in id order, its body, and the
 * names of the pages its body links to. Throws if `id` is not an aggregation.
 */
export function wikiAggregation(data: WikiData, id: string): WikiAggregation {
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
 * data does not hold dropped. Throws if `id` is not a paper page.
 */
export function wikiPaper(data: WikiData, id: string): WikiPaper {
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
