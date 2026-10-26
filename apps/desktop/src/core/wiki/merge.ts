import type { ConflictTarget, Evidence } from '../../shared/contract.js'
import { CallError } from '../call-error.js'
import type { WikiAggregationRecord, WikiCellRecord, WikiClaimRecord, WikiData, WikiPaperRecord } from './model.js'
import { isPaper } from './model.js'
import { nameKey } from './signals.js'

/**
 * What merging aggregation `from` into `into` writes, page by page, beside moving `from` to the trash:
 * - `into`: its aliases, parents, columns and claims as they become, and its body when `from` brings
 *   text;
 * - `members`: each paper with a membership in `from`, which moves to `into` when the paper is not in
 *   `into` yet (`cells` null) and otherwise folds into its `into` membership with those cells;
 * - `children`: each other aggregation under `from`, with its parents as they become;
 * - `claims`: each claim on another aggregation that refers to `from`, as it becomes;
 * - `links`: every page whose body links to `from`, which `rewriteLink` rewrites line by line.
 */
export type MergePlan = {
  from: string
  into: string
  intoFields: {
    aliases: string[]
    parents: string[]
    columns: { key: string; label: string }[]
    claims: WikiClaimRecord[]
    body: string | null
  }
  members: { paper: string; cells: Record<string, WikiCellRecord> | null }[]
  children: { page: string; parents: string[] }[]
  claims: { page: string; claim: WikiClaimRecord }[]
  links: string[]
  rewriteLink: (line: string) => string
}

/** Longest claim id a page can hold. */
const CLAIM_ID_MAX = 64

/** The heading the body of a merged page is appended under on the page it is merged into. */
export const mergedHeading = (title: string): string => `## 并自「${title}」`

/** Whether following parents upward from `from` reaches `target`. */
function reaches(data: WikiData, from: string, target: string, seen = new Set<string>()): boolean {
  if (from === target) return true
  if (seen.has(from)) return false
  seen.add(from)
  const page = data.pages[from]
  if (page === undefined || isPaper(page)) return false
  return (page.fm.parents ?? []).some((parent) => reaches(data, parent, target, seen))
}

const unique = <T>(items: T[]): T[] => [...new Set(items)]

/** Aggregation `id` of `data`. Throws a `not-found` CallError when it is absent or a paper. */
function aggregationOf(data: WikiData, id: string): WikiAggregationRecord {
  const page = data.pages[id]
  if (page === undefined || isPaper(page)) throw new CallError('not-found', `wiki 聚合不存在：${id}`)
  return page
}

/**
 * Returns what merging aggregation `from` into `into` writes (see MergePlan). Claims of `from` keep
 * their ids unless `into` holds one already, which then takes the first free `<id>-2`, `<id>-3` and on;
 * every ref to a claim of `from`, `[[from#^claim]]` body links included, follows its claim. Throws a
 * CallError when either page is not an aggregation, they are one page or of different kinds, or the
 * parents `into` takes would make a cycle.
 */
export function mergePlan(data: WikiData, from: string, into: string): MergePlan {
  const source = aggregationOf(data, from)
  const target = aggregationOf(data, into)
  if (from === into) throw new CallError('invalid', `不能把一页合并到它自己：${from}`)
  if (source.kind !== target.kind) throw new CallError('invalid', `只能合并同一种页：${from} 与 ${into}`)

  const parents = unique([
    ...(target.fm.parents ?? []).flatMap((p) => (p === from ? source.fm.parents ?? [] : [p])),
    ...source.fm.parents ?? [],
  ]).filter((p) => p !== from && p !== into)
  const cycle = parents.find((p) => reaches(data, p, into))
  if (cycle !== undefined) throw new CallError('invalid', `合并后「${target.fm.title}」会挂到自己的下级 ${cycle} 下`)

  const intoKey = nameKey(target.fm.title)
  const aliases: string[] = []
  for (const alias of [...target.fm.aliases ?? [], source.fm.title, ...source.fm.aliases ?? []]) {
    const key = nameKey(alias)
    if (key !== intoKey && !aliases.some((held) => nameKey(held) === key)) aliases.push(alias)
  }
  const keys = new Set((target.fm.columns ?? []).map((c) => c.key))
  const columns = [...target.fm.columns ?? [], ...(source.fm.columns ?? []).filter((c) => !keys.has(c.key))]
    .map((c) => ({ key: c.key, label: c.label }))

  const taken = new Set((target.fm.claims ?? []).map((c) => c.id))
  const renamed = new Map<string, string>()
  for (const claim of source.fm.claims ?? []) {
    let id = claim.id
    for (let n = 2; taken.has(id); n += 1) id = `${claim.id.slice(0, CLAIM_ID_MAX - String(n).length - 1)}-${n}`
    taken.add(id)
    renamed.set(claim.id, id)
  }
  /** `ref` as it reads once `from` is merged: a page ref or claim ref to `from` follows to `into`. */
  const refOf = (ref: string): string => {
    const [page, claim] = ref.split('#') as [string, string | undefined]
    if (page !== from) return ref
    return claim === undefined ? into : `${into}#${renamed.get(claim) ?? claim}`
  }
  const sideOf = <T extends Evidence | ConflictTarget>(side: T): T =>
    (side.kind === 'wiki' || side.kind === 'claim' ? { ...side, ref: refOf(side.ref) } : side)
  const claimOf = (claim: WikiClaimRecord, id = claim.id): WikiClaimRecord => ({
    ...claim,
    id,
    evidence: claim.evidence.map(sideOf),
    ...(claim.conflicts === undefined ? {} : { conflicts: claim.conflicts.map((c) => ({ ...c, against: sideOf(c.against) })) }),
  })
  const names = (claim: WikiClaimRecord): boolean => [...claim.evidence, ...(claim.conflicts ?? []).map((c) => c.against)]
    .some((side) => (side.kind === 'wiki' || side.kind === 'claim') && side.ref.split('#')[0] === from)
  const claims = [
    ...(target.fm.claims ?? []).map((c) => claimOf(c)),
    ...(source.fm.claims ?? []).map((c) => claimOf(c, renamed.get(c.id)!)),
  ]

  const brings = source.body.split('\n').some((line) => line.trim() !== '' && !line.startsWith('#'))
  const body = brings ? [target.body, '', mergedHeading(source.fm.title), '', source.body].join('\n').trim() : null

  const link = new RegExp(`\\[\\[${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\]|#])(?:#(\\^?)([^\\]|\\n]+))?`, 'g')
  const rewriteLink = (line: string): string => line.replace(link, (_, caret: string | undefined, part: string | undefined) => (
    part === undefined ? `[[${into}` : `[[${into}#${caret ?? ''}${caret === '^' ? renamed.get(part) ?? part : part}`
  ))
  const ids = Object.keys(data.pages).sort()
  return {
    from,
    into,
    intoFields: { aliases, parents, columns, claims, body },
    members: ids.flatMap((id) => {
      const page = data.pages[id]!
      if (!isPaper(page)) return []
      const held = page.fm.memberships ?? []
      const moving = held.find((m) => m.in === from)
      if (moving === undefined) return []
      const kept = held.find((m) => m.in === into)
      return [{ paper: id, cells: kept === undefined ? null : { ...moving.cells, ...kept.cells } }]
    }),
    children: ids.flatMap((id) => {
      const page = data.pages[id]!
      if (id === into || isPaper(page) || !(page.fm.parents ?? []).includes(from)) return []
      return [{ page: id, parents: unique((page.fm.parents ?? []).map((p) => (p === from ? into : p))) }]
    }),
    claims: ids.flatMap((id) => {
      const page = data.pages[id]!
      if (id === from || id === into || isPaper(page)) return []
      return (page.fm.claims ?? []).filter(names).map((claim) => ({ page: id, claim: claimOf(claim) }))
    }),
    links: ids.filter((id) => id !== from && data.pages[id]!.body.split('\n').some((line) => rewriteLink(line) !== line)),
    rewriteLink,
  }
}

/**
 * Returns the memberships of paper `page` once `plan` is merged: its membership in `plan.from` moved to
 * `plan.into` when `cells` is null, otherwise dropped, with its `plan.into` membership taking `cells`.
 */
export function mergedMemberships(
  page: WikiPaperRecord, plan: MergePlan, cells: Record<string, WikiCellRecord> | null,
): WikiPaperRecord['fm']['memberships'] {
  const held = page.fm.memberships ?? []
  return cells === null
    ? held.map((m) => (m.in === plan.from ? { ...m, in: plan.into } : m))
    : held.filter((m) => m.in !== plan.from).map((m) => (m.in === plan.into ? { ...m, cells } : m))
}

/**
 * Returns the lines that differ between page texts `before` and `after`, in page order, line endings
 * dropped: `- <line>` for a line `before` holds that `after` does not, `+ <line>` for one `after` adds.
 * Lines both hold, in the same order, are left out.
 */
export function changedLines(before: string, after: string): string[] {
  const a = before.replace(/\r\n/g, '\n').split('\n')
  const b = after.replace(/\r\n/g, '\n').split('\n')
  // Longest common subsequence table, filled from the ends.
  const common: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      common[i]![j] = a[i] === b[j] ? common[i + 1]![j + 1]! + 1 : Math.max(common[i + 1]![j]!, common[i]![j + 1]!)
    }
  }
  const out: string[] = []
  let [i, j] = [0, 0]
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i += 1
      j += 1
    } else if (i < a.length && (j === b.length || common[i + 1]![j]! >= common[i]![j + 1]!)) {
      out.push(`- ${a[i]}`)
      i += 1
    } else {
      out.push(`+ ${b[j]}`)
      j += 1
    }
  }
  return out
}
