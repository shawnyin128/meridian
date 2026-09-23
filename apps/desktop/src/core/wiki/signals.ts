import type { WikiSignal, WikiSignalKind } from '../../shared/contract.js'
import type { WikiAggregationRecord, WikiData, WikiPaperRecord } from './model.js'
import { claimAt, claimsOf, isPaper, titleOf } from './model.js'

/**
 * What signals need beyond the Wiki: every project with the pages its relations and node write-backs
 * name, the ids of paper pages now in the trash, and the aggregations missing a generated-region marker pair.
 */
export type SignalContext = {
  projects: { id: string; pages: string[] }[]
  trashed: ReadonlySet<string>
  missingRegions: string[]
}

/** Signal kinds in the order signals are listed. */
const KINDS: WikiSignalKind[] = [
  'unfiled-paper', 'thin-aggregation', 'single-child', 'duplicate-name', 'broken-link',
  'broken-membership', 'broken-claim-ref', 'cell-missing-anchor', 'claim-without-evidence',
  'open-conflict', 'missing-generated-region',
]

/** Write protocol §6.1: NFKC, lowercase, then every white space, punctuation and symbol character removed. */
export const nameKey = (text: string): string =>
  text.normalize('NFKC').toLowerCase().replace(/[\p{White_Space}\p{P}\p{S}]/gu, '')

/** Levenshtein distance over code points. */
function distance(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i]
    for (let j = 1; j <= b.length; j += 1) {
      cur.push(Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)))
    }
    prev = cur
  }
  return prev[b.length]!
}

/** Write protocol §6.1: two different keys of at least 6 characters one edit apart, or one the other plus `s`. */
function nearDuplicate(a: string, b: string): boolean {
  if (a === b) return false
  const [x, y] = [[...a], [...b]]
  if (x.length >= 6 && y.length >= 6 && distance(x, y) <= 1) return true
  return (a === `${b}s` && y.length >= 3) || (b === `${a}s` && x.length >= 3)
}

/**
 * Returns the deterministic signals of write protocol §6.2 for `data` and `context`, listed by kind in
 * §6.2 order, then by page, then by related ids. `detail` is one plain Chinese sentence; a broken link
 * or membership to a paper in the trash says so.
 */
export function wikiSignals(data: WikiData, context: SignalContext): WikiSignal[] {
  const out: WikiSignal[] = []
  const push = (kind: WikiSignalKind, page: string, related: string[], detail: string): void => {
    out.push({ kind, page, related, detail })
  }
  const ids = Object.keys(data.pages).sort()
  const isAggregation = (id: string): boolean => data.pages[id] !== undefined && !isPaper(data.pages[id])
  const papers = ids.filter((id) => isPaper(data.pages[id]!))
  const aggregations = ids.filter(isAggregation)
  const paper = (id: string): WikiPaperRecord => data.pages[id] as WikiPaperRecord
  const aggregation = (id: string): WikiAggregationRecord => data.pages[id] as WikiAggregationRecord
  const missing = (target: string): string => (context.trashed.has(target) ? `「${target}」在垃圾桶里` : `「${target}」不存在`)

  for (const id of papers) {
    if (!(paper(id).fm.memberships ?? []).some((m) => isAggregation(m.in))) {
      push('unfiled-paper', id, [], `「${titleOf(data, id)}」还没有归到任何一页下`)
    }
  }
  for (const id of aggregations) {
    const children = aggregations.filter((other) => (aggregation(other).fm.parents ?? []).includes(id))
    const members = papers.filter((p) => (paper(p).fm.memberships ?? []).some((m) => m.in === id))
    if (children.length === 0 && members.length <= 1) {
      push('thin-aggregation', id, members, `「${titleOf(data, id)}」没有细分,只有 ${members.length} 篇论文`)
    }
    if (children.length === 1 && members.length === 0) {
      push('single-child', id, children, `「${titleOf(data, id)}」只有一个细分,也没有直接收论文`)
    }
  }
  for (const [at, id] of aggregations.entries()) {
    const keys = (page: string): string[] =>
      [aggregation(page).fm.title, ...aggregation(page).fm.aliases ?? []].map(nameKey)
    for (const other of aggregations.slice(at + 1)) {
      if (aggregation(other).kind !== aggregation(id).kind) continue
      const pairs = keys(id).flatMap((a) => keys(other).map((b) => [a, b] as const))
      const same = pairs.some(([a, b]) => a === b)
      if (same || pairs.some(([a, b]) => nearDuplicate(a, b))) {
        push('duplicate-name', id, [other], `「${titleOf(data, id)}」与「${titleOf(data, other)}」${same ? '同名' : '名字近似'}`)
      }
    }
  }
  for (const id of ids) {
    for (const match of data.pages[id]!.body.matchAll(/\[\[([^\]|\n]+)(?:\|[^\]\n]+)?\]\]/g)) {
      const [target, block] = match[1]!.split('#') as [string, string | undefined]
      if (data.pages[target] === undefined) push('broken-link', id, [target], `正文链接的页${missing(target)}`)
      else if (block?.startsWith('^') && isAggregation(target) && claimAt(data, `${target}#${block.slice(1)}`) === undefined) {
        push('broken-claim-ref', id, [`${target}#${block.slice(1)}`], `正文链接的结论 ${target}#${block.slice(1)} 不存在`)
      }
    }
  }
  for (const id of aggregations) {
    for (const claim of claimsOf(data, id)) {
      for (const e of claim.evidence) {
        if (e.kind !== 'wiki') continue
        const target = e.ref.split('#')[0]!
        if (data.pages[target] === undefined) push('broken-link', id, [target], `结论 ${claim.id} 的证据指向的页${missing(target)}`)
        else if (e.ref.includes('#') && claimAt(data, e.ref) === undefined) {
          push('broken-claim-ref', id, [e.ref], `结论 ${claim.id} 的证据指向的结论 ${e.ref} 不存在`)
        }
      }
      for (const c of claim.conflicts ?? []) {
        if (c.against.kind === 'claim' && data.pages[c.against.ref.split('#')[0]!] !== undefined && claimAt(data, c.against.ref) === undefined) {
          push('broken-claim-ref', id, [c.against.ref], `结论 ${claim.id} 的冲突指向的结论 ${c.against.ref} 不存在`)
        }
      }
    }
  }
  for (const project of context.projects) {
    for (const target of project.pages) {
      if (!isAggregation(target)) push('broken-link', `projects/${project.id}`, [target], `项目引用的 Wiki 页${missing(target)}`)
    }
  }
  for (const id of papers) {
    for (const m of paper(id).fm.memberships ?? []) {
      if (!isAggregation(m.in)) push('broken-membership', id, [m.in], `归属的页${missing(m.in)}`)
    }
  }
  for (const id of papers) {
    for (const m of paper(id).fm.memberships ?? []) {
      for (const [key, cell] of Object.entries(m.cells ?? {})) {
        const at = (cell as { at?: { page?: unknown; quote?: unknown } }).at
        const anchored = at !== undefined && Number.isInteger(at.page) && (at.page as number) > 0
          && typeof at.quote === 'string' && at.quote.trim() !== ''
        if (!anchored) push('cell-missing-anchor', id, [`${m.in}.${key}`], `${m.in} 里「${key}」这一格没有原文锚点`)
      }
    }
  }
  for (const id of aggregations) {
    for (const claim of claimsOf(data, id)) {
      const anchored = claim.evidence.some((e) => e.kind === 'source' || e.kind === 'wiki' || e.kind === 'experiment')
      if (claim.evidence.length === 0 || (claim.by !== '我' && !anchored)) {
        push('claim-without-evidence', id, [`${id}#${claim.id}`], `结论 ${claim.id} 没有能支撑它的证据`)
      }
    }
  }
  for (const id of aggregations) {
    for (const claim of claimsOf(data, id)) {
      const conflicts = claim.conflicts ?? []
      if (conflicts.length === 0) continue
      const targets = conflicts.flatMap((c) => (c.against.kind === 'claim' ? [c.against.ref] : []))
      push('open-conflict', id, [`${id}#${claim.id}`, ...targets], `结论 ${claim.id} 有 ${conflicts.length} 处冲突没处理`)
    }
  }
  for (const id of context.missingRegions) push('missing-generated-region', id, [], `「${titleOf(data, id)}」缺生成区的标记`)

  const rank = (s: WikiSignal): number => KINDS.indexOf(s.kind)
  const order = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0)
  return out.sort((a, b) => rank(a) - rank(b)
    || order(a.page, b.page) || order(a.related.join('\n'), b.related.join('\n')))
}
