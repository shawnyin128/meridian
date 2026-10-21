import { createHash } from 'node:crypto'
import { z } from 'zod'
import type {
  AgentSession, Attachment, ChangeEntry, ChangeSource, DiffPiece, Milestone, PaperCell, PaperColumn, PaperFields,
  PaperHighlight, PaperNote, PaperRow, ProjectDetail, ReadingMutation, Task,
} from '../shared/contract.js'
import {
  ChangeEntrySchema, PaperColumnsSchema, PaperHighlightSchema, PaperNoteSchema, PaperRowSchema,
  ProjectDetailSchema,
} from '../shared/contract.js'
import { topicDir, topicProposal, topicTitleKey } from '../shared/topic-proposal.js'
import {
  COLUMN_TYPE_LABEL, DEFAULT_PROJECT_TOPIC, LATER_PAPER, NO_PROJECT_AREA, PAPER_PAGE, TRASH_RETENTION_DAYS,
} from '../shared/vocabulary.js'
import { CallError } from './call-error.js'
import { dayOf } from './dates.js'
import { liveColumns, misfitCells } from './paper-library/index.js'
import type { ProjectRecord } from './project-management/index.js'
import type { PageText, PaperSnapshot } from './vault/records.js'
import { PageTextSchema, PaperSnapshotSchema } from './vault/records.js'
import { readRecord, withUnknownFields, type StoredList } from './vault/stored-records.js'
import type { VaultOps, VaultStore } from './vault.js'

/** Changes made by the user in the UI; a proposal applied from the review queue records its own chip. */
const BY_ME: ChangeSource = '我'

/** Number of leading SHA-256 hexadecimal characters used for a fingerprint. */
const FINGERPRINT_CHARS = 16

/**
 * What a project change title names for the writes that are not progress on the project: reordering
 * its tasks or relations, and deleting the project itself.
 */
const REORDER_TASKS = '调整任务顺序'
const MOVE_RELATION = '调整关联顺序'
const DELETE_PROJECT = '删掉'
const NOT_PROGRESS: ReadonlySet<string> = new Set([REORDER_TASKS, MOVE_RELATION, DELETE_PROJECT])

/**
 * Project fields captured in recent changes and restored from snapshots. Project fingerprints and
 * diffs inspect only these fields, excluding ids, derived values, legacy conclusions, research graphs,
 * and other project research state outside undo history.
 */
export const PROJECT_FIELDS: (keyof ProjectRecord & keyof ProjectDetail)[] = [
  'name', 'status', 'priority', 'topic', 'focus', 'block', 'start', 'due', 'memo',
  'papers', 'tasks', 'milestones', 'events', 'relations', 'attachments',
  'agentSessions', 'verifiedConclusions',
]

/**
 * Project fields added after fingerprints were first stored. They are left out of a fingerprint while
 * absent, so a project that never set one keeps the fingerprint older records hold.
 */
const LATER_PROJECT_FIELDS: ReadonlySet<string> = new Set(['verifiedConclusions'])

/**
 * Entity changed by one record. Before undo, resolve its current shape and compare it with the stored
 * fingerprint. `pages` covers pages touched by one proposal: `id` joins their paths and `paths` lists
 * each page. `columns` targets one paper-table column whose key is `id`. `columnType` also targets one
 * column, but includes every populated cell in that column across the library. `customColumns` targets
 * the paper table's custom columns as a whole and has an empty `id`. `note` and `highlight` target the
 * reading note or highlight `id` of paper `paper`, and `remark` the remark of paper `id`.
 */
const ChangeTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('paper'), id: z.string() }).strict(),
  z.object({ kind: z.literal('project'), id: z.string() }).strict(),
  z.object({ kind: z.literal('pages'), id: z.string(), paths: z.array(z.string()) }).strict(),
  z.object({ kind: z.literal('columns'), id: z.string() }).strict(),
  z.object({ kind: z.literal('columnType'), id: z.string() }).strict(),
  z.object({ kind: z.literal('customColumns'), id: z.string() }).strict(),
  z.object({ kind: z.literal('note'), id: z.string(), paper: z.string() }).strict(),
  z.object({ kind: z.literal('highlight'), id: z.string(), paper: z.string() }).strict(),
  z.object({ kind: z.literal('remark'), id: z.string() }).strict(),
])

/**
 * Work required to restore a change. `paper` and `project` hold the pre-change entity snapshot.
 * `trash` means the write moved an item to trash, so restoration puts that stored item back.
 * `created` means the write created a project that did not previously exist, so undo deletes it.
 * `pages` stores the previous full text of touched pages; restore rewrites them and deletes pages that
 * were previously absent. `option` reverses a column option rename from `from` to `to`. `columnType`
 * restores the previous column and every cell in it, then reinserts a group removed when converting
 * to text at `groupAt` (null means it was not grouped or the conversion was unrelated).
 * `customColumns` holds the previous custom columns, which restore sets again, keeping the hidden,
 * grouped and ordered columns as they stand except those naming a column it removes. `note` and
 * `highlight` put one back as it stood before the write among paper `paper`'s: in place of the one
 * holding its id, or at position `at` when it was deleted. `remark` sets that paper's remark back to
 * `text`. Both leave the rest of the paper's reading state as it stands.
 */
const RestoreSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('paper'), snapshot: PaperSnapshotSchema }).strict(),
  z.object({ kind: z.literal('project'), project: ProjectDetailSchema }).strict(),
  z.object({ kind: z.literal('trash'), entry: z.string() }).strict(),
  z.object({ kind: z.literal('created') }).strict(),
  z.object({ kind: z.literal('pages'), pages: z.array(PageTextSchema) }).strict(),
  z.object({ kind: z.literal('option'), key: z.string(), from: z.string(), to: z.string() }).strict(),
  z.object({
    kind: z.literal('columnType'),
    column: PaperColumnsSchema.shape.custom.element,
    groupAt: z.number().int().nullable(),
    cells: PaperRowSchema.shape.custom,
  }).strict(),
  z.object({ kind: z.literal('customColumns'), columns: PaperColumnsSchema.shape.custom }).strict(),
  z.object({ kind: z.literal('note'), paper: z.string(), at: z.number().int(), note: PaperNoteSchema }).strict(),
  z.object({
    kind: z.literal('highlight'), paper: z.string(), at: z.number().int(), highlight: PaperHighlightSchema,
  }).strict(),
  z.object({ kind: z.literal('remark'), paper: z.string(), text: z.string() }).strict(),
])

/**
 * Stored change record: cross-boundary fields plus restoration data. `target` identifies the changed
 * entity, `after` is its post-change fingerprint, and `restore` describes undo work. Restoration data
 * expires while the historical record remains. Seeded fixture rows predate this feature and use null,
 * an empty string, and null for those fields. `at` is the recorded epoch-millisecond timestamp at the
 * vault day's UTC midnight and drives retention. Only seeded history stores `meta`; newer rows derive
 * their date bucket from `at`. `archived` defaults to false for files written before archiving existed.
 * `date` is derived from `at` at read time rather than stored twice where it could drift, and so are
 * the shown `lines`, from `diff` and the vault as it stands, and `named`, from `title` and `target`.
 */
export const ChangeRecordSchema = ChangeEntrySchema
  .omit({ meta: true, undoable: true, date: true, lines: true, named: true })
  .extend({
    meta: z.string().nullable(),
    target: ChangeTargetSchema.nullable(),
    after: z.string(),
    at: z.number().int(),
    restore: RestoreSchema.nullable(),
    archived: z.boolean().default(false),
  })

export type ChangeRecord = z.infer<typeof ChangeRecordSchema>
type ChangeTarget = z.infer<typeof ChangeTargetSchema>
type Restore = z.infer<typeof RestoreSchema>

/**
 * Project `id`'s `lastProgress` field as ProjectDetail defines it, empty when there is none: the newest
 * day among `records`, the project's research records on its page and in its bound workspace, and the
 * changes `rows` record to it or undo, other than those NOT_PROGRESS names.
 */
export function lastProgressOf(
  rows: readonly ChangeRecord[], id: string, records: readonly { date: string }[],
): Pick<ProjectDetail, 'lastProgress'> {
  const changed = rows
    .filter((row) => row.target?.kind === 'project' && row.target.id === id
      // A project change title ends in `· ` and what changed, after the project's name.
      && !NOT_PROGRESS.has(row.title.slice(row.title.lastIndexOf('· ') + 2)))
    .map((row) => new Date(row.at).toISOString().slice(0, 10))
  const newest = [...records.map((record) => record.date), ...changed].sort().at(-1)
  return newest === undefined ? {} : { lastProgress: newest }
}

/** Rewrites a research graph an older version snapshotted: its `activePath` chain becomes `activeNodes` holding the chain's last id. */
function upgradeGraph(graph: unknown): void {
  if (typeof graph !== 'object' || graph === null || !('activePath' in graph)) return
  const held = graph as { activePath?: unknown; activeNodes?: unknown }
  const path = held.activePath
  delete held.activePath
  if (held.activeNodes === undefined && Array.isArray(path) && path.length > 0) held.activeNodes = [path.at(-1)]
}

/**
 * Parses the stored change log one record at a time, upgrading project snapshots older versions
 * wrote and leaving out fields this version does not know. A record whose undo data still cannot be
 * read is kept as history without undo (`restore: null`); a record that cannot be read at all is
 * left out of `rows`. Both are reported on stderr. `stored` writes a record without undo back as
 * written while it is unchanged and with its original undo data once changed, every unreadable
 * record as written, and every other record with its unknown fields put back. So an unreadable
 * record never keeps the library from opening, and no save loses it.
 */
export function parseChangeRecords(raw: unknown): StoredList<ChangeRecord> {
  if (!Array.isArray(raw)) throw new Error('最近变动文件不是列表')
  const rows: ChangeRecord[] = []
  const unreadable: unknown[] = []
  /** What to write for each row read, by its id. */
  const writes = new Map<string, (row: ChangeRecord) => unknown>()
  raw.forEach((written: unknown, index) => {
    // Upgrading rewrites a snapshot in place, so it works on a copy and `written` stays as it was.
    const row = structuredClone(written) as { restore?: { kind?: unknown; project?: { graph?: unknown; workspace?: { graph?: unknown } } } } | null
    if (row?.restore?.kind === 'project') {
      upgradeGraph(row.restore.project?.graph)
      upgradeGraph(row.restore.project?.workspace?.graph)
    }
    const whole = readRecord(ChangeRecordSchema, row)
    if (!('error' in whole)) {
      rows.push(whole.value)
      writes.set(whole.value.id, (next) => withUnknownFields(next, whole.unknown))
      return
    }
    console.error(`[changelog] record ${index}: ${whole.error.slice(0, 300)}`)
    const withoutUndo = readRecord(ChangeRecordSchema, { ...row, target: null, restore: null })
    if ('error' in withoutUndo) {
      unreadable.push(written)
      return
    }
    const { target, restore } = written as { target: unknown; restore: unknown }
    rows.push(withoutUndo.value)
    writes.set(withoutUndo.value.id, (next) => (next === withoutUndo.value
      ? written
      : { ...withUnknownFields(next, withoutUndo.unknown) as object, target, restore }))
  })
  return {
    rows,
    unreadable,
    stored: (next) => [...(next as ChangeRecord[]).map((row) => writes.get(row.id)?.(row) ?? row), ...unreadable],
  }
}

/** Where a write retains its previous entity: snapshot, trash, no prior entity, or an explicit restore operation. */
type Keep = 'snapshot' | 'trash' | 'created' | Restore

/**
 * Current entity shape. Naming and diffing distinguish entity kinds. Papers also carry a page snapshot
 * for undo because the cross-boundary row cannot distinguish an absent read state from an explicit
 * unread value. Column entities contain only that column for fingerprinting, while column-type entities
 * additionally contain every cell in the column across the library, and the custom-columns entity holds
 * every custom column. Reading entities name paper
 * `paper` titled `title`; a note or highlight also carries its position `at` among the paper's.
 */
type Entity =
  | { kind: 'paper'; paper: PaperRow; snapshot: PaperSnapshot }
  | { kind: 'project'; project: ProjectDetail }
  | { kind: 'pages'; pages: PageText[] }
  | { kind: 'columns'; column: PaperColumn }
  | { kind: 'columnType'; column: PaperColumn; cells: Record<string, PaperCell> }
  | { kind: 'customColumns'; columns: PaperColumn[] }
  | { kind: 'note'; paper: string; title: string; at: number; note: PaperNote }
  | { kind: 'highlight'; paper: string; title: string; at: number; highlight: PaperHighlight }
  | { kind: 'remark'; paper: string; title: string; remark: string }

/** Change-log storage: `.meridian` for real vaults and memory for fixtures. */
export type ChangeLogStore = {
  load(): ChangeRecord[]
  save(rows: ChangeRecord[]): void
  nextId(): string
}

/** Target and title tail of a reading command recorded as a change, undefined for a command that is not recorded. */
function readingChange(paper: string, mutation: ReadingMutation): [ChangeTarget, string] | undefined {
  switch (mutation.kind) {
    case 'note.update': return [{ kind: 'note', id: mutation.id, paper }, '改了笔记']
    case 'note.delete': return [{ kind: 'note', id: mutation.id, paper }, '删掉笔记']
    case 'highlight.update': return [{ kind: 'highlight', id: mutation.id, paper }, '改了高亮批注']
    case 'highlight.delete': return [{ kind: 'highlight', id: mutation.id, paper }, '删掉高亮']
    case 'remark.set': return [{ kind: 'remark', id: paper }, '改了随笔']
    default: return undefined
  }
}

/**
 * Change title of a write that takes the custom columns from `from` to `to`: the column it deletes,
 * creates or renames, or the option it deletes or adds, else the column settings in general.
 */
function customColumnsTitle(from: PaperColumn[], to: PaperColumn[]): string {
  const deleted = from.find((c) => !to.some((n) => n.key === c.key))
  if (deleted) return `论文表 · 删掉列「${deleted.label}」`
  const created = to.find((c) => !from.some((p) => p.key === c.key))
  if (created) return `论文表 · 新建列「${created.label}」`
  for (const column of to) {
    const held = from.find((c) => c.key === column.key)!
    if (held.label !== column.label) return `论文表 · 列「${held.label}」改名为「${column.label}」`
    const dropped = held.options.find((option) => !column.options.includes(option))
    if (dropped !== undefined) return `论文表 · 列「${column.label}」删掉选项「${dropped}」`
    const added = column.options.find((option) => !held.options.includes(option))
    if (added !== undefined) return `论文表 · 列「${column.label}」新建选项「${added}」`
  }
  return '论文表 · 改了列设置'
}

/** `list` with `item` in place of the element holding its id, or inserted at `at` when none does. */
function putBack<T extends { id: string }>(list: readonly T[], at: number, item: T): T[] {
  return list.some((held) => held.id === item.id)
    ? list.map((held) => (held.id === item.id ? item : held))
    : list.toSpliced(at, 0, item)
}

/** Entity value without its kind, used for diffs and fingerprints. */
function valueOf(entity: Entity): Record<string, unknown> {
  switch (entity.kind) {
    case 'paper': return entity.paper
    case 'project': return Object.fromEntries(PROJECT_FIELDS.flatMap((key) => (
      LATER_PROJECT_FIELDS.has(key) && entity.project[key] === undefined ? [] : [[key, entity.project[key]]]
    )))
    case 'columns': return entity.column
    case 'columnType': return { ...entity.column, cells: entity.cells }
    case 'customColumns': return { custom: entity.columns }
    case 'note': return { page: entity.note.page, text: entity.note.text }
    case 'highlight': return { page: entity.highlight.page, quote: entity.highlight.quote, note: entity.highlight.note }
    case 'remark': return entity.remark === '' ? {} : { remark: entity.remark }
    default: return Object.fromEntries(entity.pages.map((p) => [p.path, p.text]))
  }
}

/** Change lines of a column type change: the previous and the next type. */
const typeLines = (from: PaperColumn['type'], to: PaperColumn['type']): string[] =>
  [`- 类型：${COLUMN_TYPE_LABEL[from]}`, `+ 类型：${COLUMN_TYPE_LABEL[to]}`]

/** JSON with sorted object keys so identical content always serializes identically for fingerprinting. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  const entries = Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
  return `{${entries.join(',')}}`
}

/** Current fingerprint of an entity, or an empty string when it no longer exists. */
const fingerprint = (entity: Entity | undefined): string => (entity === undefined
  ? ''
  : createHash('sha256').update(stableJson(valueOf(entity))).digest('hex').slice(0, FINGERPRINT_CHARS))

/** What change lines call a priority, a task state and, by the project's status, a project's focus. */
const PRIORITY = { p0: '紧急', p1: '常规', p2: '较低' } as const
const TASK_STATE = { act: '进行中', plan: '计划中', done: '已完成' } as const
const FOCUS: Record<ProjectDetail['status'], string> = { 进行中: '当前目标', 搁置: '重启条件', 已完成: '成果' }

/** One field's reading in change lines: its text, empty when the field is empty, or a list's elements. */
type Reading = string | readonly string[]

/** How change lines read an ISO date; empty when there is none. */
type DateReading = (iso: string | undefined) => string

/** A field as change lines show it: its label and how an entity's value of it reads. */
type Field<T> = readonly [label: string, read: (entity: T, date: DateReading) => Reading]

/** Listed items in change lines: what one is called, its id and name, and its fields. */
type Items<T> = { label: string; id: (item: T) => string; name: (item: T) => string; fields: readonly Field<T>[] }

/** A project relation with the group it is listed under. */
type GroupedRelation = ProjectDetail['relations'][number]['items'][number] & { group: string }

const COLUMN_FIELDS: readonly Field<Omit<PaperColumn, 'key'>>[] = [
  ['列名', (c) => c.label], ['类型', (c) => COLUMN_TYPE_LABEL[c.type]], ['选项', (c) => c.options],
]

/** The read state's label, and the earlier one it keeps while a custom column holds that label. */
const READ_STATE = '阅读状态'
const READ_STATE_TAKEN = '状态'

/** How change lines read a read state: the read-later state by the name the App shows for it. */
const readStateReading = (state: PaperRow['readState']): string => (state === LATER_PAPER ? '待读' : state)

/** The paper fields the user edits; ids, counts, page state and timestamps are the vault's own and not shown. */
const PAPER_FIELDS: readonly Field<PaperRow>[] = [
  ['标题', (p) => p.title], ['短标题', (p) => p.shortTitle ?? ''], ['作者', (p) => p.authors ?? []],
  ['年份', (p) => p.year?.toString() ?? ''], ['发表', (p) => p.venue],
  ['评分', (p) => (p.rating === undefined ? '' : `${p.rating} 星`)], ['编号', (p) => p.identifier ?? ''],
  ['提交', (p, date) => date(p.submitted)], ['摘要', (p) => p.abstract ?? ''], ['主题', (p) => p.topics],
  ['方法', (p) => p.methods], ['数据集', (p) => p.datasets], ['指标', (p) => p.metrics],
  [READ_STATE, (p) => readStateReading(p.readState)], ['随笔', (p) => p.remark ?? ''],
]

const NOTE_FIELDS: readonly Field<PaperNote>[] = [['页码', (n) => String(n.page)], ['笔记', (n) => n.text]]
const HIGHLIGHT_FIELDS: readonly Field<PaperHighlight>[] = [
  ['页码', (h) => String(h.page)], ['高亮', (h) => h.quote], ['批注', (h) => h.note],
]

const TASKS: Items<Task> = {
  label: '任务', id: (t) => t.id, name: (t) => t.title,
  fields: [
    ['名称', (t) => t.title], ['开始', (t, date) => date(t.start)], ['结束', (t, date) => date(t.end)],
    ['时段', (t) => (t.window === undefined ? '' : `${t.window.start}–${t.window.end}`)],
    ['状态', (t) => TASK_STATE[t.state]], ['优先级', (t) => PRIORITY[t.priority]], ['备注', (t) => t.note ?? ''],
  ],
}
const MILESTONES: Items<Milestone> = {
  label: '里程碑', id: (m) => m.id, name: (m) => m.title,
  fields: [['名称', (m) => m.title], ['日期', (m, date) => date(m.date)], ['状态', (m) => (m.done ? '已完成' : '未完成')]],
}
const RELATIONS: Items<GroupedRelation> = {
  label: '关联', id: (r) => r.id, name: (r) => r.text,
  fields: [['名称', (r) => r.text], ['分组', (r) => r.group], ['链接', (r) => r.url ?? '']],
}
const ATTACHMENTS: Items<Attachment> = {
  label: '附件', id: (f) => f.id, name: (f) => f.name,
  fields: [['名称', (f) => f.name], ['大小', (f) => f.size], ['位置', (f) => f.path ?? '']],
}
const SESSIONS: Items<AgentSession> = {
  label: 'agent 会话', id: (s) => s.id, name: (s) => s.title,
  fields: [['名称', (s) => s.title], ['日期', (s, date) => date(s.when)], ['结果', (s) => s.outcome]],
}
const CUSTOM_COLUMNS: Items<PaperColumn> = { label: '列', id: (c) => c.key, name: (c) => c.label, fields: COLUMN_FIELDS }

/** The elements of a reading: a list's, a text's own, or none for an empty text. */
const elements = (reading: Reading): string[] =>
  (typeof reading !== 'string' ? [...reading] : reading === '' ? [] : [reading])

/** `items` as change lines with `sign`, each after `label`. */
const signedLines = (sign: '+' | '-', label: string, items: readonly string[]): string[] =>
  items.map((item) => `${sign} ${label}：${item}`)

/**
 * The change lines of a field labelled `label` that reads `a` before and `b` after. A list compares
 * element by element: each element gone is a `-` line, each new one a `+` line, and a reorder emits
 * nothing. Any other value emits its old reading as `-` and its new one as `+`, the `+` line labelled
 * `labelAfter`; an empty reading emits no line.
 */
function readingLines(label: string, a: Reading, b: Reading, labelAfter = label): string[] {
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b ? [] : [...signedLines('-', label, elements(a)), ...signedLines('+', labelAfter, elements(b))]
  }
  const dropped = elements(a)
  const added = elements(b).filter((item) => {
    const at = dropped.indexOf(item)
    if (at < 0) return true
    dropped.splice(at, 1)
    return false
  })
  return [...signedLines('-', label, dropped), ...signedLines('+', labelAfter, added)]
}

/** The change lines of `fields` from `a` to `b`, each label after `prefix`. */
const fieldLines = <T>(fields: readonly Field<T>[], a: T, b: T, date: DateReading, prefix = ''): string[] =>
  fields.flatMap(([label, read]) => readingLines(`${prefix}${label}`, read(a, date), read(b, date)))

/** The change lines of `fields` for `entity` added (`+`) or removed (`-`): one per element of each reading. */
const sideLines = <T>(sign: '+' | '-', fields: readonly Field<T>[], entity: T, date: DateReading): string[] =>
  fields.flatMap(([label, read]) => signedLines(sign, label, elements(read(entity, date))))

/**
 * The change lines of a list of items from `a` to `b`, matched by id: an item gone or new is one line
 * with its name, and each changed field of an item in both is a line under the item's name after the change.
 */
function itemLines<T>(items: Items<T>, a: readonly T[], b: readonly T[], date: DateReading): string[] {
  const held = new Map(a.map((item) => [items.id(item), item]))
  const kept = new Set(b.map(items.id))
  return [
    ...a.filter((item) => !kept.has(items.id(item))).map((item) => `- ${items.label}：${items.name(item)}`),
    ...b.flatMap((item) => {
      const old = held.get(items.id(item))
      return old === undefined
        ? [`+ ${items.label}：${items.name(item)}`]
        : fieldLines(items.fields, old, item, date, `${items.label}「${items.name(item)}」· `)
    }),
  ]
}

/** The change lines between two shapes of one project, in the order the project page shows its fields. */
function projectLines(a: ProjectDetail, b: ProjectDetail, date: DateReading): string[] {
  const field = (label: string, read: (p: ProjectDetail) => Reading): string[] => readingLines(label, read(a), read(b))
  const relations = (p: ProjectDetail): GroupedRelation[] =>
    p.relations.flatMap((g) => g.items.map((item) => ({ ...item, group: g.group })))
  const verified = (p: ProjectDetail): string[] => (p.verifiedConclusions ?? []).map((v) => p.projectConclusions
    ?.find((c) => c.node === v.node)?.text
    ?? [...p.graph.nodes, ...p.workspace?.graph?.nodes ?? []].find((n) => n.id === v.node)?.label ?? v.node)
  return [
    ...field('名称', (p) => p.name),
    ...field('状态', (p) => p.status),
    ...field('优先级', (p) => PRIORITY[p.priority]),
    ...field('领域', (p) => (p.topic === DEFAULT_PROJECT_TOPIC ? NO_PROJECT_AREA : p.topic)),
    ...readingLines(FOCUS[a.status], a.focus, b.focus, FOCUS[b.status]),
    ...field('阻塞', (p) => p.block ?? ''),
    ...field('开始', (p) => date(p.start)),
    ...field('截止', (p) => date(p.due)),
    ...field('项目随笔', (p) => p.memo),
    ...field('关联论文', (p) => p.papers.map((id) => p.paperTitles[id] ?? id)),
    ...itemLines(TASKS, a.tasks, b.tasks, date),
    ...itemLines(MILESTONES, a.milestones, b.milestones, date),
    ...field('科研记录', (p) => p.events.map((e) => e.text)),
    ...itemLines(RELATIONS, relations(a), relations(b), date),
    ...itemLines(ATTACHMENTS, a.attachments, b.attachments, date),
    ...itemLines(SESSIONS, a.agentSessions, b.agentSessions, date),
    ...field('已验证实验结论', verified),
  ]
}

/**
 * The change lines between the pre- and post-change entity of one target: one for each changed field,
 * with its label and a readable value. Dates read as month and day, with the year when it is not
 * `year`; enum values by their names; papers, tasks, milestones, relations, attachments and columns by
 * their names; custom cells under the label their column has in `columns`, and the read state under its
 * earlier label while one of them holds its label. A paper, project or column created or deleted is one
 * line with its name; a note or highlight lists its fields. Throws for a pages entity, whose changes the
 * proposal or the body edit describes, and when the entity changed kind.
 */
function changeLines(
  before: Entity | undefined, after: Entity | undefined, { year, columns }: { year: string; columns: readonly PaperColumn[] },
): string[] {
  const date: DateReading = (iso) => (iso === undefined
    ? ''
    : `${iso.slice(0, 4) === year ? '' : `${iso.slice(0, 4)}年`}${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`)
  const sign = before === undefined ? '+' : '-'
  /** Both sides as entities of `kind`; throws when the target's entity changed kind. */
  const sides = <K extends Entity['kind']>(kind: K) => [before, after].map((entity) => {
    if (entity !== undefined && entity.kind !== kind) throw new Error(`同一目标前后的实体种类不同：${kind} → ${entity.kind}`)
    return entity
  }) as [Extract<Entity, { kind: K }> | undefined, Extract<Entity, { kind: K }> | undefined]
  const one = (before ?? after)!
  switch (one.kind) {
    case 'paper': {
      const [a, b] = sides('paper')
      if (a === undefined || b === undefined) return [`${sign} 论文：${one.paper.title}`]
      const label = (key: string): string => columns.find((c) => c.key === key)?.label ?? key
      const fields = columns.some((c) => c.label === READ_STATE)
        ? PAPER_FIELDS.map((field): Field<PaperRow> => (field[0] === READ_STATE ? [READ_STATE_TAKEN, field[1]] : field))
        : PAPER_FIELDS
      return [
        ...fieldLines(fields, a.paper, b.paper, date),
        ...[...new Set([...Object.keys(a.paper.custom), ...Object.keys(b.paper.custom)])]
          .flatMap((key) => readingLines(label(key), a.paper.custom[key] ?? '', b.paper.custom[key] ?? '')),
      ]
    }
    case 'project': {
      const [a, b] = sides('project')
      return a === undefined || b === undefined ? [`${sign} 项目：${one.project.name}`] : projectLines(a.project, b.project, date)
    }
    case 'columns':
    case 'columnType': {
      const [a, b] = sides(one.kind)
      return a === undefined || b === undefined
        ? [`${sign} 列：${one.column.label}`]
        : fieldLines(COLUMN_FIELDS, a.column, b.column, date)
    }
    case 'customColumns': {
      const [a, b] = sides('customColumns')
      return itemLines(CUSTOM_COLUMNS, a?.columns ?? [], b?.columns ?? [], date)
    }
    case 'note': {
      const [a, b] = sides('note')
      return a === undefined || b === undefined
        ? sideLines(sign, NOTE_FIELDS, one.note, date)
        : fieldLines(NOTE_FIELDS, a.note, b.note, date)
    }
    case 'highlight': {
      const [a, b] = sides('highlight')
      return a === undefined || b === undefined
        ? sideLines(sign, HIGHLIGHT_FIELDS, one.highlight, date)
        : fieldLines(HIGHLIGHT_FIELDS, a.highlight, b.highlight, date)
    }
    case 'remark': {
      const [a, b] = sides('remark')
      return readingLines('随笔', a?.remark ?? '', b?.remark ?? '')
    }
    default: throw new Error('Wiki 页的改动由提案或正文编辑自己描述')
  }
}

/**
 * A change title that names its entity, undone any number of times: a paper's or project's name, up to
 * the first `」· ` after it, or a Wiki page's title in a body edit's title. The name is group 1 or 2.
 */
const NAMED_TITLE = /^(?:撤销[：:])*(?:(?:论文|项目)「(.+?)」· |Wiki · 「(.+)」· 改了正文$)/sd

/** The labels changeLines writes a paper's title under; the rest of such a line is the title. */
const PAPER_TITLE_LINE = /^([+-] (?:论文|关联论文|标题|短标题)：)(.+)$/s

/** A Wiki page id, or a claim ref (`<page>#<claim>`), as a describeOp line or a body line writes it. */
const WIKI_REF = /([\p{L}\p{N}._-]+\/[\p{L}\p{N}._-]+)(#[a-z0-9][a-z0-9-]{0,63})?/gu

/**
 * Stored change line `line` as shown, in pieces: a paper title written under one of changeLines' title
 * labels is paper text, and each Wiki page id or claim ref names its page by `title` (paper pages as
 * paper text, a claim by the page it is on). A ref whose page `title` does not know stays as written.
 */
function shownLine(line: string, title: (page: string) => string | undefined): DiffPiece[] {
  const titled = PAPER_TITLE_LINE.exec(line)
  if (titled !== null) return [titled[1]!, { paper: titled[2]! }]
  const pieces: DiffPiece[] = []
  const text = (part: string): void => {
    if (part === '') return
    const last = pieces.at(-1)
    if (typeof last === 'string') pieces[pieces.length - 1] = last + part
    else pieces.push(part)
  }
  let from = 0
  for (const match of line.matchAll(WIKI_REF)) {
    const page = match[1]!
    const name = title(page)
    text(line.slice(from, match.index))
    if (name === undefined) text(match[0])
    else if (page.startsWith(PAPER_PAGE)) pieces.push({ paper: name })
    else text(name)
    from = match.index + match[0].length
  }
  text(line.slice(from))
  return pieces.length === 0 ? [''] : pieces
}

/**
 * Wraps the given operations so that every write that changes the vault's
 * lasting knowledge — the paper writes, the paper-table writes that change its
 * custom columns, editing or deleting a reading note or highlight, setting a
 * remark, the project writes, and a proposal's writes, and none of the inbox,
 * later-queue, watch, chat, feed, trash, other reading or other paper-table
 * writes — is recorded, and adds
 * the changelog reads and the undo the contract carries, and setPaperTopic,
 * recorded as the proposal it applies. Records are kept in
 * `log`, newest first, and a record is written after its write, by core, so no
 * caller has to say what it changed. Undo writes back the entity as it stood
 * before the recorded write, which for a write that emptied into the trash is
 * restoring that trash entry, and for a project that write created is deleting
 * it again; the snapshot never crosses the contract. Undo is refused unless the
 * entity still stands exactly as that write left it, so an out-of-order undo
 * never silently drops a later change. A paper's undo is refused, too, when its
 * snapshot holds a cell the columns as they stand now could not take. A paper
 * put back from the trash, by restoring it or by undoing its deletion, has the
 * cells those columns could not take emptied through updatePaper, recorded as a
 * change of its own. When the log itself cannot be written, a record of a write
 * that landed stays in `log` and is written with the next save, while archiving,
 * deleting or expiring records leaves `log` as it was.
 */
export function withChangelog(ops: VaultOps, log: ChangeLogStore): VaultStore {
  let rows = log.load()

  /** Current vault time as epoch milliseconds at today's UTC midnight, shared by recording and retention. */
  const nowMs = (): number => Date.parse(`${ops.today()}T00:00:00Z`)

  /** The change lines between the two shapes of an entity, read against the vault's year and columns now. */
  const describe = (before: Entity | undefined, after: Entity | undefined): string[] =>
    changeLines(before, after, { year: ops.today().slice(0, 4), columns: ops.paperColumns().custom })

  /**
   * Current entity shape, or undefined when the paper, project or column no longer exists. Any other
   * failure to read it, such as a project whose research graph getProject rejects, throws.
   */
  const entityOf = (target: ChangeTarget): Entity | undefined => {
    switch (target.kind) {
      case 'paper':
        return ops.hasPaper(target.id)
          ? { kind: 'paper', paper: ops.getPaper(target.id), snapshot: ops.paperSnapshot(target.id) }
          : undefined
      case 'project':
        return ops.hasProject(target.id) ? { kind: 'project', project: ops.getProject(target.id) } : undefined
      case 'pages':
        return { kind: 'pages', pages: ops.readPages(target.paths) }
      case 'columnType': {
        const column = ops.paperColumns().custom.find((c) => c.key === target.id)
        return column === undefined ? undefined : { kind: 'columnType', column, cells: ops.paperCells(target.id) }
      }
      case 'customColumns': return { kind: 'customColumns', columns: ops.paperColumns().custom }
      case 'note': {
        const notes = ops.hasPaper(target.paper) ? ops.paperReading(target.paper).notes : []
        const at = notes.findIndex((note) => note.id === target.id)
        return at < 0
          ? undefined
          : { kind: 'note', paper: target.paper, title: ops.getPaper(target.paper).title, at, note: notes[at]! }
      }
      case 'highlight': {
        const highlights = ops.hasPaper(target.paper) ? ops.paperReading(target.paper).highlights : []
        const at = highlights.findIndex((highlight) => highlight.id === target.id)
        return at < 0
          ? undefined
          : { kind: 'highlight', paper: target.paper, title: ops.getPaper(target.paper).title, at, highlight: highlights[at]! }
      }
      case 'remark':
        return ops.hasPaper(target.id)
          ? { kind: 'remark', paper: target.id, title: ops.getPaper(target.id).title, remark: ops.paperReading(target.id).remark }
          : undefined
      default: {
        const column = ops.paperColumns().custom.find((c) => c.key === target.id)
        return column === undefined ? undefined : { kind: 'columns', column }
      }
    }
  }

  /** Display name of an entity in a change title. */
  const nameOf = (entity: Entity): string => {
    switch (entity.kind) {
      case 'paper': return entity.paper.title
      case 'project': return entity.project.name
      case 'columns':
      case 'columnType': return entity.column.label
      case 'customColumns': return '论文表'
      case 'note':
      case 'highlight':
      case 'remark': return entity.title
      default: return entity.pages.map((p) => p.path).join('、')
    }
  }

  /** Drop restoration snapshots after retention expires while keeping the records. */
  const dropExpired = (): void => {
    const cutoff = nowMs() - TRASH_RETENTION_DAYS * 86_400_000
    if (!rows.some((row) => row.restore !== null && row.at <= cutoff)) return
    const next = rows.map((row) => (row.restore !== null && row.at <= cutoff ? { ...row, restore: null } : row))
    log.save(next)
    rows = next
  }

  /** Restoration work for a record. Snapshot mode stores the previous entity; explicit work is used as-is. */
  const restoreOf = (keep: Keep, before: Entity | undefined): Restore => {
    if (typeof keep !== 'string') return keep
    if (keep === 'created') return { kind: 'created' }
    if (keep === 'trash') {
      const entry = ops.listTrash()[0]
      if (!entry) throw new Error('这次删除之后垃圾桶里没有多出一条')
      return { kind: 'trash', entry: entry.id }
    }
    if (before === undefined) throw new Error('改动之前库里没有这个实体，存不下快照')
    switch (before.kind) {
      case 'paper': return { kind: 'paper', snapshot: before.snapshot }
      case 'project': {
        // Derived anew on every read, so the stored snapshot leaves it out.
        const project = { ...before.project }
        delete project.lastProgress
        return { kind: 'project', project }
      }
      case 'pages': return { kind: 'pages', pages: before.pages }
      case 'customColumns': return { kind: 'customColumns', columns: before.columns }
      case 'note': return { kind: 'note', paper: before.paper, at: before.at, note: before.note }
      case 'highlight': return { kind: 'highlight', paper: before.paper, at: before.at, highlight: before.highlight }
      case 'remark': return { kind: 'remark', paper: before.paper, text: before.remark }
      default: throw new Error('列这一类变动没有快照可存，还原要现成的那一份')
    }
  }

  /** Record one entry at the front of the log; `source` is its chip. */
  const push = (
    target: ChangeTarget, what: string, keep: Keep, before: Entity | undefined, diff?: string[],
    source: ChangeSource = BY_ME,
  ): void => {
    const after = entityOf(target)
    const named = before ?? after
    if (!named) throw new Error('这次写的前后库里都没有这个实体，记不下它是什么')
    rows = [{
      id: log.nextId(),
      title: target.kind === 'pages' || target.kind === 'columns' || target.kind === 'columnType'
        || target.kind === 'customColumns'
        ? what
        : `${target.kind === 'project' ? '项目' : '论文'}「${nameOf(named)}」· ${what}`,
      meta: null,
      source,
      diff: diff ?? describe(before, after),
      target,
      after: fingerprint(after),
      at: nowMs(),
      undone: false,
      archived: false,
      restore: restoreOf(keep, before),
    }, ...rows]
    log.save(rows)
  }

  /** Logged write: capture the entity before mutation, then record the completed write. */
  const wrote = <T>(
    target: ChangeTarget, what: string, keep: Keep, write: () => T, diff?: string[],
  ): T => {
    const before = entityOf(target)
    const result = write()
    push(target, what, keep, before, diff)
    return result
  }

  /**
   * Project write that records the pre-change project as `keep` says. The project it returns counts
   * this write's record in `lastProgress`, which the write read before the record existed.
   */
  const onProject = (
    id: string, what: string, write: () => ProjectDetail, keep: Keep = 'snapshot',
  ): ProjectDetail => {
    const project = wrote({ kind: 'project', id }, what, keep, write)
    return { ...project, ...lastProgressOf(rows, id, [...project.events, ...project.workspace?.events ?? []]) }
  }

  /** Paper-field write that records the paper's pre-change shape. */
  const updatePaper = (id: string, patch: Partial<PaperFields>): void =>
    wrote({ kind: 'paper', id }, '改了字段', 'snapshot', () => ops.updatePaper(id, patch))

  /** Clear and record cells incompatible with current columns; do nothing when every cell still fits. */
  const dropMisfits = (id: string): void => {
    const misfits = misfitCells(ops.paperColumns(), ops.getPaper(id), {})
    if (misfits.length === 0) return
    updatePaper(id, { custom: Object.fromEntries(misfits.map(({ column }) => [column.key, null])) })
  }

  const store: VaultStore = {
    ...ops,

    updatePaper,

    setPaperColumns(columns) {
      const held = ops.paperColumns().custom
      // Hidden, grouped and ordered columns only change the view, so a write touching nothing else is not recorded.
      if (stableJson(held) === stableJson(columns.custom)) return ops.setPaperColumns(columns)
      return wrote(
        { kind: 'customColumns', id: '' }, customColumnsTitle(held, columns.custom), 'snapshot',
        () => ops.setPaperColumns(columns),
      )
    },

    renamePaperOption(key, from, to) {
      const column = ops.paperColumns().custom.find((c) => c.key === key)
      if (!column) throw new CallError('not-found', `论文表里没有这一列：${key}`)
      return wrote(
        { kind: 'columns', id: key },
        `论文表 · 列「${column.label}」的选项 ${from} → ${to}`,
        { kind: 'option', key, from: to, to: from },
        () => ops.renamePaperOption(key, from, to),
        [`- 选项：${from}`, `+ 选项：${to}`],
      )
    },

    setPaperColumnType(key, type) {
      const target: ChangeTarget = { kind: 'columnType', id: key }
      const before = entityOf(target)
      if (before?.kind !== 'columnType') throw new CallError('not-found', `论文表里没有这一列：${key}`)
      const groupAt = ops.paperColumns().groups.indexOf(key)
      ops.setPaperColumnType(key, type)
      push(
        target,
        `论文表 · 列「${before.column.label}」的类型 ${COLUMN_TYPE_LABEL[before.column.type]} → ${COLUMN_TYPE_LABEL[type]}`,
        { kind: 'columnType', column: before.column, groupAt: type === 'text' && groupAt >= 0 ? groupAt : null, cells: before.cells },
        before,
        typeLines(before.column.type, type),
      )
    },

    deletePaper(id) {
      return wrote({ kind: 'paper', id }, '删掉', 'trash', () => ops.deletePaper(id))
    },

    mutatePaperReading(id, mutation) {
      const change = readingChange(id, mutation)
      return change === undefined
        ? ops.mutatePaperReading(id, mutation)
        : wrote(change[0], change[1], 'snapshot', () => ops.mutatePaperReading(id, mutation))
    },

    restoreTrash(id) {
      const paper = ops.trashedPaper(id)
      ops.restoreTrash(id)
      if (paper !== undefined) dropMisfits(paper)
    },

    createProject(name) {
      const had = new Set(ops.listProjects().map((p) => p.id))
      ops.createProject(name)
      const made = ops.listProjects().find((p) => !had.has(p.id))
      if (!made) throw new Error('新建项目之后库里没有多出一个项目')
      push({ kind: 'project', id: made.id }, '新建', 'created', undefined)
    },

    updateProject(id, patch) {
      return onProject(id, '改了字段', () => ops.updateProject(id, patch))
    },

    absorbAgentTasks(projectId) {
      for (const { project, request } of ops.agentTaskRequests(projectId)) {
        const target: ChangeTarget = { kind: 'project', id: project }
        const before = entityOf(target)
        ops.addAgentTask(project, request)
        push(target, '添加任务', 'snapshot', before, undefined, 'Meridian')
      }
    },

    verifyConclusion(projectId, node, fingerprint) {
      return onProject(projectId, '验证实验结论', () => ops.verifyConclusion(projectId, node, fingerprint))
    },

    unverifyConclusion(projectId, node) {
      return onProject(projectId, '取消验证实验结论', () => ops.unverifyConclusion(projectId, node))
    },

    deleteProject(id) {
      return wrote({ kind: 'project', id }, DELETE_PROJECT, 'trash', () => ops.deleteProject(id))
    },

    createTask(projectId, task) {
      return onProject(projectId, '添加任务', () => ops.createTask(projectId, task))
    },

    updateTask(projectId, taskId, patch) {
      return onProject(projectId, '改了任务', () => ops.updateTask(projectId, taskId, patch))
    },

    deleteTask(projectId, taskId) {
      return onProject(projectId, '删掉任务', () => ops.deleteTask(projectId, taskId))
    },

    reorderTasks(projectId, order) {
      return onProject(projectId, REORDER_TASKS, () => ops.reorderTasks(projectId, order))
    },

    createMilestone(projectId, milestone) {
      return onProject(projectId, '添加里程碑', () => ops.createMilestone(projectId, milestone))
    },

    updateMilestone(projectId, milestoneId, patch) {
      return onProject(projectId, '改了里程碑', () =>
        ops.updateMilestone(projectId, milestoneId, patch))
    },

    deleteMilestone(projectId, milestoneId) {
      return onProject(projectId, '删掉里程碑', () => ops.deleteMilestone(projectId, milestoneId))
    },

    createRelation(projectId, relation) {
      return onProject(projectId, '添加关联', () => ops.createRelation(projectId, relation))
    },

    deleteRelation(projectId, relationId) {
      return onProject(projectId, '删掉关联', () => ops.deleteRelation(projectId, relationId))
    },

    updateRelation(projectId, relationId, relation) {
      return onProject(projectId, '改了关联', () => ops.updateRelation(projectId, relationId, relation))
    },

    addPaper(projectId, paperId) {
      return onProject(projectId, '关联论文', () => ops.addPaper(projectId, paperId))
    },

    removePaper(projectId, paperId) {
      return onProject(projectId, '移除关联论文', () => ops.removePaper(projectId, paperId))
    },

    moveRelation(projectId, id, index) {
      return onProject(projectId, MOVE_RELATION, () => ops.moveRelation(projectId, id, index))
    },

    createAttachment(projectId, attachment) {
      return onProject(projectId, '添加附件', () => ops.createAttachment(projectId, attachment))
    },

    deleteAttachment(projectId, attachmentId) {
      return onProject(projectId, '删掉附件', () => ops.deleteAttachment(projectId, attachmentId), 'trash')
    },

    createEvent(projectId, text, node) {
      return onProject(projectId, '记入科研记录', () => ops.createEvent(projectId, text, node))
    },

    recordAction(id, messageId) {
      const action = ops.chatMessages(id).find((message) => message.id === messageId)?.actions[0]
      return action === undefined
        ? ops.recordAction(id, messageId)
        : onProject(action.project, '记入科研记录', () => ops.recordAction(id, messageId))
    },

    setPaperTopic(id, topic, member) {
      const paper = ops.getPaper(id)
      const next = member
        ? [...paper.topics, topic]
        : paper.topics.filter((held) => topicTitleKey(held) !== topicTitleKey(topic))
      const filing = topicProposal(id, paper.title, paper.topics, next, ops.wikiCards(), topicDir(ops.wikiHome()))
      if (filing === null) {
        throw new CallError('refused', `「${paper.title}」${member ? '已经' : '不'}在主题「${topic}」里`)
      }
      store.applyProposal(filing)
    },

    applyProposal(proposal, producer = { by: BY_ME, source: BY_ME }) {
      const paths = ops.proposalPages(proposal, producer.by)
      const target: ChangeTarget = { kind: 'pages', id: paths.join('\n'), paths }
      const before = entityOf(target)
      const diff = ops.describeProposal(proposal.ops)
      ops.applyProposal(proposal, producer)
      push(target, `Wiki · ${proposal.title}`, 'snapshot', before, diff, producer.source)
    },

    updateWikiPage(id, body) {
      const title = id.startsWith(PAPER_PAGE) ? ops.wikiPaper(id).title : ops.wikiAggregation(id).title
      return wrote({ kind: 'pages', id, paths: [id] }, `Wiki · 「${title}」· 改了正文`, 'snapshot', () => ops.updateWikiPage(id, body), [`~ ${id}`])
    },

    listChanges() {
      dropExpired()
      const day = ops.today()
      let aggregations: Map<string, string> | undefined
      /** The title of Wiki page `id` as the vault holds it now, undefined when there is no such page. */
      const title = (id: string): string | undefined => {
        aggregations ??= new Map(ops.wikiCards().map((card) => [card.id, card.title]))
        return aggregations.get(id)
          ?? (id.startsWith(PAPER_PAGE) && ops.pageVersion(id) !== null ? ops.wikiPaper(id).title : undefined)
      }
      /** The entity of `target` that change title `heading` names, when it names one that is in the vault. */
      const namedIn = (heading: string, target: ChangeTarget | null): ChangeEntry['named'] => {
        const name = NAMED_TITLE.exec(heading)?.indices?.slice(1).find((span) => span !== undefined)
        if (name === undefined || target === null) return undefined
        const [from, to] = name
        switch (target.kind) {
          case 'paper':
          case 'remark': return ops.hasPaper(target.id) ? { kind: 'paper', id: target.id, from, to } : undefined
          case 'note':
          case 'highlight': return ops.hasPaper(target.paper) ? { kind: 'paper', id: target.paper, from, to } : undefined
          case 'project': return ops.hasProject(target.id) ? { kind: 'project', id: target.id, from, to } : undefined
          case 'pages': {
            const page = target.paths.length === 1 ? target.paths[0]! : undefined
            return page !== undefined && title(page) !== undefined ? { kind: 'page', id: page, from, to } : undefined
          }
          default: return undefined
        }
      }
      return rows.map((row): ChangeEntry => {
        const date = new Date(row.at).toISOString().slice(0, 10)
        const named = namedIn(row.title, row.target)
        return {
          id: row.id,
          title: row.title,
          meta: row.meta ?? dayOf(date, day),
          date,
          source: row.source,
          diff: [...row.diff],
          lines: row.diff.map((line) => shownLine(line, title)),
          ...(named === undefined ? {} : { named }),
          undone: row.undone,
          undoable: !row.undone && row.target !== null && row.restore !== null,
          archived: row.archived,
        }
      })
    },

    undoChange(id) {
      dropExpired()
      const at = rows.findIndex((row) => row.id === id)
      const row = rows[at]
      if (!row) throw new CallError('not-found', `最近变动里没有这一条：${id}`)
      if (row.undone) throw new CallError('refused', '这一条已经撤销过了')
      const { target, restore } = row
      if (target === null) throw new CallError('refused', '这一条撤不了：库里没有还原它所需的东西')
      if (restore === null) {
        throw new CallError('refused', `这一条的快照已过 ${TRASH_RETENTION_DAYS} 天保留期，撤不了了`)
      }

      const before = entityOf(target)
      if (fingerprint(before) !== row.after) {
        // Newer records are at the front, so every record newer than this one precedes it.
        const newer = rows.slice(0, at)
          .filter((r) => !r.undone && r.target?.kind === target.kind && r.target.id === target.id)
        throw newer.length > 0
          ? new CallError('newer-changes', `这条之后该实体又被改过 ${newer.length} 次，先撤销较新的那几条`)
          : new CallError('changed', target.kind === 'columns' || target.kind === 'columnType'
            ? '这一列之后又改过，撤销会盖掉那次改动'
            : '这条之后该实体已经不是当时的样子，撤销会盖掉那次改动，所以拒绝')
      }

      if (restore.kind === 'paper') {
        // A later column type or option change may reject snapshot values and make future column edits impossible.
        const held = ops.getPaper(target.id)
        const misfit = misfitCells(ops.paperColumns(), { ...held, custom: restore.snapshot.custom }, held.custom)[0]
        if (misfit !== undefined) {
          throw new CallError('changed',
            `这篇论文的「${misfit.column.label}」列之后改过类型或选项，撤销会写进这一列现在放不下的值`, { cause: misfit.cause },
          )
        }
      }

      if (restore.kind === 'trash') ops.restoreTrash(restore.entry)
      else if (restore.kind === 'created') ops.deleteProject(target.id)
      else if (restore.kind === 'paper') ops.putPaper(target.id, restore.snapshot)
      else if (restore.kind === 'option') ops.renamePaperOption(restore.key, restore.from, restore.to)
      else if (restore.kind === 'columnType') ops.putPaperColumn(restore.column, restore.groupAt, restore.cells)
      else if (restore.kind === 'pages') ops.putPages(restore.pages)
      else if (restore.kind === 'customColumns') {
        ops.setPaperColumns(liveColumns({ ...ops.paperColumns(), custom: restore.columns }))
      }
      else if (restore.kind === 'note') {
        const held = ops.paperReading(restore.paper)
        ops.putPaperReading(restore.paper, { ...held, notes: putBack(held.notes, restore.at, restore.note) })
      } else if (restore.kind === 'highlight') {
        const held = ops.paperReading(restore.paper)
        ops.putPaperReading(restore.paper, { ...held, highlights: putBack(held.highlights, restore.at, restore.highlight) })
      } else if (restore.kind === 'remark') {
        ops.putPaperReading(restore.paper, { ...ops.paperReading(restore.paper), remark: restore.text })
      } else ops.putProject(restore.project)

      rows = rows.map((r) => (r.id === id ? { ...r, undone: true } : r))
      const after = entityOf(target)
      rows = [{
        id: log.nextId(),
        title: `撤销：${row.title}`,
        meta: null,
        source: BY_ME,
        // Proposal targets hold full page text; a normal line diff would copy every page verbatim into the record.
        diff: restore.kind === 'pages'
          ? restore.pages.map((p) => `~ ${p.path}`)
          : restore.kind === 'columnType' && before?.kind === 'columnType'
            ? typeLines(before.column.type, restore.column.type)
            : describe(before, after),
        target,
        after: fingerprint(after),
        at: nowMs(),
        undone: false,
        // The newly recorded undo just happened, so its archive state is independent of the reverted record.
        archived: false,
        // This is history, not an undo stack; the undo action itself cannot be undone again.
        restore: null,
      }, ...rows]
      log.save(rows)
      // Undoing deletion mirrors trash restoration: restore the paper, record the undo, then clear incompatible cells in a separate entry.
      if (restore.kind === 'trash' && target.kind === 'paper') dropMisfits(target.id)
    },

    archiveChange(id) {
      const row = rows.find((r) => r.id === id)
      if (!row) throw new CallError('not-found', `最近变动里没有这一条：${id}`)
      if (row.archived) return
      const next = rows.map((r) => (r.id === id ? { ...r, archived: true } : r))
      log.save(next)
      rows = next
    },

    archiveAllChanges() {
      if (rows.every((r) => r.archived)) return
      const next = rows.map((r) => (r.archived ? r : { ...r, archived: true }))
      log.save(next)
      rows = next
    },

    deleteChange(id) {
      if (!rows.some((row) => row.id === id)) throw new CallError('not-found', `最近变动里没有这一条：${id}`)
      const next = rows.filter((row) => row.id !== id)
      log.save(next)
      rows = next
    },

    clearArchivedChanges() {
      if (!rows.some((row) => row.archived)) return
      const next = rows.filter((row) => !row.archived)
      log.save(next)
      rows = next
    },
  }
  return store
}
