import type { Proposal, ProposalOp } from '../../shared/contract.js'
import type {
  WikiAggregationRecord, WikiCellRecord, WikiData, WikiMembershipRecord, WikiPaperRecord,
} from './model.js'
import { isPaper } from './model.js'

/** Returns the line one entry takes in an append section: date, separator, text. */
export const entryLine = (date: string, text: string): string => `- ${date} · ${text}`

/**
 * Returns the id of every page a proposal writes, in the order the proposal
 * first touches each: the paper of a membership op, the page of an entry,
 * columns or parents op, the id a create op makes.
 */
export function touchedPages(proposal: Proposal): string[] {
  const out: string[] = []
  for (const op of proposal.ops) {
    const id = op.op === 'setMembership' || op.op === 'removeMembership' ? op.paper
      : op.op === 'createAggregation' ? op.id : op.page
    if (!out.includes(id)) out.push(id)
  }
  return out
}

/** Returns the one-line diff the change log shows for `op`. */
export function describeOp(op: ProposalOp): string {
  switch (op.op) {
    case 'createAggregation': return `+ ${op.id} 新建(${op.kind})`
    case 'setMembership': return `+ ${op.paper} ∈ ${op.in}(${Object.keys(op.cells).length} 格)`
    case 'removeMembership': return `- ${op.paper} ∈ ${op.in}`
    case 'appendEntry': return `+ ${op.page} § ${op.section}:${op.text}`
    case 'setColumns': return `~ ${op.page} 列:${op.columns.map((c) => c.key).join(',')}`
    case 'setParents': return `~ ${op.page} 属于:${op.parents.join(',')}`
    case 'setAggregationMetadata': return `~ ${op.page} 元数据:${op.title}`
  }
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

/** Data after one operation. Throw when the operation is invalid for `data`. */
function step(data: WikiData, op: ProposalOp, today: string): WikiData {
  const pages = { ...data.pages }
  switch (op.op) {
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
 * itself, a duplicate, or one that would make a cycle.
 */
export function applyProposal(data: WikiData, proposal: Proposal, today: string): WikiData {
  return proposal.ops.reduce((next, op) => step(next, op, today), data)
}
