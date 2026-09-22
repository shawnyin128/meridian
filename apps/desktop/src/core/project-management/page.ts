import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { ProjectDetail } from '../../shared/contract.js'
import { ProjectDetailSchema } from '../../shared/contract.js'
import { spliceLines } from '../vault/writer.js'

/** Values representable in frontmatter. */
type Json = string | number | boolean | Json[] | { [key: string]: Json }

/** Project-page type stored in the same frontmatter `type` field as other vault pages. */
const PAGE_TYPE = 'project'

/** Headings for the two body sections: one research event per line, then memo through end of file. */
const EVENTS = '科研记录'
const MEMO = '随笔'

/** Empty-list representation used consistently across vault pages. */
const EMPTY_LIST = '[]'

/** A `key: value` line. An empty second group after `key:` means its value is the indented block below. */
const PAIR = /^ *([\w-]+):(?: (.*))?$/

/** One research-record line. */
const EVENT = /^- (\d{4}-\d{2}-\d{2}) (.*)$/

/** Node marker at the start of an event body. Accept `[agent] ` before or after it; later `[node:x]` text remains body content. */
const NODE_MARK = /^(\[agent\] )?\[node:([^\]\s]+)\] (\[agent\] )?/

/** Prefix for agent-written event bodies; the node marker follows it. */
const AGENT_PREFIX = '[agent] '

/** Keys whose contract names differ from their page representation. */
const PAGE_KEYS = {
  conflictPage: 'conflict_page',
  conclusionList: 'conclusion_list',
  agentSessions: 'agent_sessions',
  workspaceRoot: 'workspace_root',
  workspaceSsh: 'workspace_ssh',
} as const

const detail = ProjectDetailSchema.shape

/**
 * Stored project record: all cross-boundary fields plus its creation date. Creation date only
 * determines ordering between projects and is never displayed, so it stays inside Core.
 */
export type ProjectRecord = Omit<
  ProjectDetail, 'paperCount' | 'paperTitles' | 'conclusions' | 'workspace'
> & {
  created: string
  workspaceRoot?: string
  workspaceSsh?: { host: string; path: string; port?: number | undefined }
}

/**
 * Project-page frontmatter shape. Research-graph edges are stored as endpoint objects rather than
 * tuples because the line-oriented reader understands keyed items but not nested sequences. Ignore
 * user-added keys while reading; field updates replace only their own lines and preserve those keys.
 */
const ProjectPageSchema = z.object({
  type: z.literal(PAGE_TYPE),
  name: detail.name,
  created: detail.start,
  status: detail.status,
  priority: detail.priority,
  topic: detail.topic,
  focus: detail.focus,
  block: detail.block,
  conflict_page: detail.conflictPage,
  workspace_root: z.string().min(1).optional(),
  workspace_ssh: z.object({
    host: z.string().min(1),
    path: z.string().min(1),
    port: z.number().int().min(1).max(65_535).optional(),
  }).strict().optional(),
  start: detail.start,
  due: detail.due,
  papers: detail.papers.default([]),
  conclusion_list: detail.conclusionList.default([]),
  tasks: detail.tasks,
  milestones: detail.milestones,
  relations: detail.relations,
  attachments: detail.attachments,
  graph: z.object({
    nodes: detail.graph.shape.nodes,
    edges: z.array(z.object({ from: z.string(), to: z.string() }).strict()),
    active_path: detail.graph.shape.activePath,
  }).strict(),
  agent_sessions: detail.agentSessions,
})

/** Remove a trailing CR from one line; only external editors can introduce it. */
const withoutCr = (row: string): string => (row.endsWith('\r') ? row.slice(0, -1) : row)

/** Number of indentation characters on one line. */
const indentOf = (row: string): number => row.length - row.trimStart().length

/** Page representation of a scalar: quote and escape strings; leave numbers and booleans bare. */
const emitScalar = (value: string | number | boolean): string =>
  (typeof value === 'string' ? JSON.stringify(value) : String(value))

/** Read a scalar value from its page representation. */
const readScalar = (token: string): Json => {
  if (token.startsWith('"')) return JSON.parse(token) as string
  if (token === 'true') return true
  if (token === 'false') return false
  return Number(token)
}

/** Lines occupied by one frontmatter key, starting at `indent`. */
function emitKey(key: string, value: Json, indent: string): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}${key}: ${EMPTY_LIST}`]
    return [`${indent}${key}:`, ...value.flatMap((item) => emitItem(item, `${indent}  `))]
  }
  if (typeof value === 'object') {
    return [
      `${indent}${key}:`,
      ...Object.entries(value).flatMap(([k, v]) => emitKey(k, v, `${indent}  `)),
    ]
  }
  return [`${indent}${key}: ${emitScalar(value)}`]
}

/** Lines occupied by one sequence item: the first starts with `- ` and the rest align to its first key. */
function emitItem(value: Json, indent: string): string[] {
  if (typeof value !== 'object') return [`${indent}- ${emitScalar(value)}`]
  const rows = Object.entries(value).flatMap(([k, v]) => emitKey(k, v, `${indent}  `))
  return [`${indent}- ${rows[0]!.slice(indent.length + 2)}`, ...rows.slice(1)]
}

/** Replace each leading `- ` with equal-width indentation and record those line numbers as item starts. */
function normalize(rows: string[]): { rows: string[]; items: Set<number> } {
  const items = new Set<number>()
  const flattened = rows.map((row, i) => {
    const dash = /^( *)- (.*)$/.exec(row)
    if (!dash) return row
    items.add(i)
    return `${dash[1]}  ${dash[2]}`
  })
  return { rows: flattened, items }
}

/**
 * Read a mapping at indentation `indent` starting from `from`, returning its value and the first line
 * after the block. Throw when a key requires a nested block but none exists.
 */
function readMapping(
  rows: string[], items: Set<number>, from: number, indent: number,
): [Record<string, Json>, number] {
  const out: Record<string, Json> = {}
  let i = from
  while (i < rows.length) {
    const row = rows[i]!
    if (row.trim() === '' || indentOf(row) !== indent) break
    if (i > from && items.has(i)) break
    const pair = PAIR.exec(row)
    if (!pair) break
    const key = pair[1]!
    const token = pair[2]
    if (token !== undefined) {
      out[key] = token === EMPTY_LIST ? [] : readScalar(token)
      i += 1
      continue
    }
    // Sequence `- ` prefixes were replaced with equal-width indentation, so items are one level deeper than mapping keys.
    const block = i + 1
    const inner = indent + (items.has(block) ? 4 : 2)
    if (block >= rows.length || indentOf(rows[block]!) !== inner) {
      throw new Error(`frontmatter 的 ${key} 下面没有块`)
    }
    const [value, after] = items.has(block)
      ? readSequence(rows, items, block, inner)
      : readMapping(rows, items, block, inner)
    out[key] = value
    i = after
  }
  return [out, i]
}

/** Read a sequence at indentation `indent` from `from`, returning its value and the next line number. */
function readSequence(
  rows: string[], items: Set<number>, from: number, indent: number,
): [Json[], number] {
  const out: Json[] = []
  let i = from
  while (i < rows.length && items.has(i) && indentOf(rows[i]!) === indent) {
    if (!PAIR.test(rows[i]!)) {
      out.push(readScalar(rows[i]!.trim()))
      i += 1
      continue
    }
    const [value, after] = readMapping(rows, items, i, indent)
    out.push(value)
    i = after
  }
  return [out, i]
}

/** Split a page into frontmatter and body lines. Throw when frontmatter has no closing delimiter. */
function splitRows(file: string): { front: string[]; body: string[]; close: number } {
  const rows = readFileSync(file, 'utf8').split('\n').map(withoutCr)
  const close = rows.indexOf('---', 1)
  if (rows[0] !== '---' || close < 0) throw new Error(`页面没有收口的 frontmatter:${file}`)
  return { front: rows.slice(1, close), body: rows.slice(close + 1), close }
}

/** Line range of a `## heading` body section, from the following line to the next level-two heading. */
function sectionRange(rows: string[], heading: string): [number, number] {
  const start = rows.findIndex((row) => withoutCr(row) === `## ${heading}`)
  if (start < 0) throw new Error(`页里没有「${heading}」这一节`)
  const rest = rows.slice(start + 1).findIndex((row) => row.startsWith('## '))
  return [start + 1, rest < 0 ? rows.length : start + 1 + rest]
}

/**
 * Parse an event-line body into the contract shape: extract a leading `[node:x]` into `node`, keep
 * `[agent] ` at the start of text, and preserve every other character. An unmarked line is all body.
 */
function eventOf(date: string, raw: string): ProjectDetail['events'][number] {
  const mark = NODE_MARK.exec(raw)
  if (mark === null) return { date, text: raw }
  const rest = raw.slice(mark[0].length)
  const agent = mark[1] !== undefined || mark[3] !== undefined
  return { date, text: agent ? `${AGENT_PREFIX}${rest}` : rest, node: mark[2]! }
}

/** Event body linked to a node: place the marker after `[agent] ` and before all remaining text. */
const withNode = (text: string, node: string): string => (text.startsWith(AGENT_PREFIX)
  ? `${AGENT_PREFIX}[node:${node}] ${text.slice(AGENT_PREFIX.length)}`
  : `[node:${node}] ${text}`)

/** Research-record section lines: one event per line with a blank line on each side. */
const eventLines = (events: ProjectDetail['events']): string[] => ['', ...events.map((event) =>
  `- ${event.date} ${event.node === undefined ? event.text : withNode(event.text, event.node)}`), '']

/** Memo section lines: preserve memo text verbatim and leave a trailing newline. */
const memoLines = (memo: string): string[] => ['', ...(memo === '' ? [] : memo.split('\n')), '']

/** Frontmatter representation of a project. */
function frontOf(project: ProjectRecord): Record<string, Json> {
  return {
    type: PAGE_TYPE,
    name: project.name,
    created: project.created,
    status: project.status,
    priority: project.priority,
    topic: project.topic,
    focus: project.focus,
    ...(project.block === undefined ? {} : { block: project.block }),
    ...(project.conflictPage === undefined ? {} : { conflict_page: project.conflictPage }),
    ...(project.workspaceRoot === undefined ? {} : { workspace_root: project.workspaceRoot }),
    ...(project.workspaceSsh === undefined ? {} : { workspace_ssh: project.workspaceSsh }),
    start: project.start,
    due: project.due,
    papers: project.papers,
    conclusion_list: project.conclusionList.map((conclusion) => ({
      id: conclusion.id,
      text: conclusion.text,
      state: conclusion.state,
      date: conclusion.date,
      source: conclusion.source,
      ...(conclusion.paper === undefined ? {} : { paper: conclusion.paper }),
    })),
    tasks: project.tasks,
    milestones: project.milestones,
    relations: project.relations,
    attachments: project.attachments,
    graph: {
      nodes: project.graph.nodes,
      edges: project.graph.edges.map(([from, to]) => ({ from, to })),
      ...(project.graph.activePath === undefined ? {} : { active_path: project.graph.activePath }),
    },
    agent_sessions: project.agentSessions,
    // Optional contract fields are absent rather than explicitly undefined, which does not match the
    // index signature. Unwritten keys are missing at runtime, so emitKey never sees them.
  } as Record<string, Json>
}

/** Returns the text of a page holding the given project. */
export function projectPageText(project: ProjectRecord): string {
  return [
    '---',
    ...Object.entries(frontOf(project)).flatMap(([key, value]) => emitKey(key, value, '')),
    '---',
    '',
    `# ${project.name}`,
    '',
    `## ${EVENTS}`,
    ...eventLines(project.events),
    `## ${MEMO}`,
    ...memoLines(project.memo),
  ].join('\n')
}

/**
 * Reads the project the page at `file` holds, taking `id` as the project's id.
 * Throws if the page is not a project page, or its frontmatter is not the shape
 * a project page carries.
 */
export function readProjectPage(file: string, id: string): ProjectRecord {
  const { front, body } = splitRows(file)
  const flattened = normalize(front)
  const mapping = readMapping(flattened.rows, flattened.items, 0, 0)[0]
  // Older pages stored `page` on nodes and omitted writebacks. Drop the obsolete field and supply the current default.
  for (const node of (mapping['graph'] as { nodes?: Record<string, Json>[] } | undefined)?.nodes ?? []) {
    delete node['page']
    node['writebacks'] ??= []
  }
  const page = ProjectPageSchema.parse(mapping)
  const [eventsFrom, eventsTo] = sectionRange(body, EVENTS)
  const [memoFrom, memoTo] = sectionRange(body, MEMO)
  return {
    id,
    created: page.created,
    name: page.name,
    status: page.status,
    priority: page.priority,
    topic: page.topic,
    focus: page.focus,
    ...(page.block === undefined ? {} : { block: page.block }),
    ...(page.conflict_page === undefined ? {} : { conflictPage: page.conflict_page }),
    ...(page.workspace_root === undefined ? {} : { workspaceRoot: page.workspace_root }),
    ...(page.workspace_ssh === undefined ? {} : { workspaceSsh: page.workspace_ssh }),
    start: page.start,
    due: page.due,
    memo: body.slice(memoFrom, memoTo).join('\n').trim(),
    conclusionList: page.conclusion_list,
    papers: page.papers,
    tasks: page.tasks,
    milestones: page.milestones,
    events: body.slice(eventsFrom, eventsTo).flatMap((row) => {
      const event = EVENT.exec(withoutCr(row))
      return event === null ? [] : [eventOf(event[1]!, event[2]!)]
    }),
    relations: page.relations,
    attachments: page.attachments,
    graph: {
      nodes: page.graph.nodes,
      edges: page.graph.edges.map(({ from, to }): [string, string] => [from, to]),
      ...(page.graph.active_path === undefined ? {} : { activePath: page.graph.active_path }),
    },
    agentSessions: page.agent_sessions,
  }
}

/** Removes named top-level frontmatter keys and returns the keys that were present. */
export function dropProjectPageKeys(
  file: string, keys: readonly string[], staging: string,
): string[] {
  const removed: string[] = []
  for (const key of keys) {
    const { front: rows } = splitRows(file)
    const start = rows.findIndex((row) => row.startsWith(`${key}:`))
    if (start < 0) continue
    let end = start + 1
    while (end < rows.length && rows[end]!.startsWith(' ')) end += 1
    spliceLines(file, start + 1, end + 1, [], staging)
    removed.push(key)
  }
  return removed
}

/**
 * Writes the named fields of the given project onto the page at `file`,
 * replacing only the lines each of those fields occupies and leaving every
 * other byte of the page untouched. A field the page does not yet carry is
 * added just before the frontmatter closes. Each write is staged under
 * `staging` and renamed over the page, the way spliceLines has it. Throws if
 * the page is not a project page, or a named field has no place on it.
 */
export function writeProjectFields(
  file: string, project: ProjectRecord, fields: (keyof ProjectRecord)[], staging: string,
): void {
  const front = frontOf(project)
  for (const field of fields) {
    if (field === 'events' || field === 'memo') {
      const heading = field === 'events' ? EVENTS : MEMO
      const lines = field === 'events' ? eventLines(project.events) : memoLines(project.memo)
      const { body, close } = splitRows(file)
      const [from, to] = sectionRange(body, heading)
      spliceLines(file, close + 1 + from, close + 1 + to, lines, staging)
      continue
    }
    if (field === 'name') {
      const { body, close } = splitRows(file)
      const at = body.findIndex((row) => row.startsWith('# '))
      if (at < 0) throw new Error(`页里没有标题行:${file}`)
      spliceLines(file, close + 1 + at, close + 2 + at, [`# ${project.name}`], staging)
    }
    const key: string = field in PAGE_KEYS ? PAGE_KEYS[field as keyof typeof PAGE_KEYS] : field
    const value = front[key]
    if (value === undefined && (
      field === 'block' || field === 'workspaceRoot' || field === 'workspaceSsh'
    )) {
      const removable = field === 'block'
        ? 'block'
        : field === 'workspaceRoot' ? 'workspace_root' : 'workspace_ssh'
      dropProjectPageKeys(file, [removable], staging)
      continue
    }
    if (value === undefined) throw new Error(`项目页上没有这一项:${key}`)
    const { front: rows, close } = splitRows(file)
    const start = rows.findIndex((row) => row.startsWith(`${key}:`))
    const lines = emitKey(key, value, '')
    if (start < 0) {
      spliceLines(file, close, close, lines, staging)
      continue
    }
    let end = start + 1
    while (end < rows.length && rows[end]!.startsWith(' ')) end += 1
    spliceLines(file, start + 1, end + 1, lines, staging)
  }
}
