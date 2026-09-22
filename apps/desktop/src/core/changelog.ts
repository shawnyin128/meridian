import { createHash } from 'node:crypto'
import { z } from 'zod'
import type {
  ChangeEntry, ChangeSource, PaperCell, PaperColumn, PaperFields, PaperRow, ProjectDetail,
} from '../shared/contract.js'
import {
  ChangeEntrySchema, PaperColumnsSchema, PaperRowSchema, ProjectDetailSchema,
} from '../shared/contract.js'
import { COLUMN_TYPE_LABEL, PAPER_PAGE, PROJECTS_DIR, TRASH_RETENTION_DAYS } from '../shared/vocabulary.js'
import { dayOf } from './dates.js'
import { misfitCells } from './paper-library/index.js'
import type { ProjectRecord } from './project-management/index.js'
import type { PageText, PaperSnapshot } from './vault/records.js'
import { PageTextSchema, PaperSnapshotSchema } from './vault/records.js'
import type { VaultOps, VaultStore } from './vault.js'
import { describeOp } from './wiki/index.js'

/** Changes made by the user in the UI. No other writer currently contributes recorded entries. */
const BY_ME: ChangeSource = '我'

/** Number of leading SHA-256 hexadecimal characters used for a fingerprint. */
const FINGERPRINT_CHARS = 16

/**
 * Project fields captured in recent changes and restored from snapshots. Project fingerprints and
 * diffs inspect only these fields, excluding ids, derived values, legacy conclusions, research graphs,
 * and other project research state outside undo history.
 */
export const PROJECT_FIELDS: (keyof ProjectRecord & keyof ProjectDetail)[] = [
  'name', 'status', 'priority', 'topic', 'focus', 'block', 'start', 'due', 'memo',
  'papers', 'tasks', 'milestones', 'events', 'relations', 'attachments',
  'agentSessions',
]

/**
 * Entity changed by one record. Before undo, resolve its current shape and compare it with the stored
 * fingerprint. `pages` covers pages touched by one proposal: `id` joins their paths and `paths` lists
 * each page. `columns` targets one paper-table column whose key is `id`. `columnType` also targets one
 * column, but includes every populated cell in that column across the library.
 */
const ChangeTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('paper'), id: z.string() }).strict(),
  z.object({ kind: z.literal('project'), id: z.string() }).strict(),
  z.object({ kind: z.literal('pages'), id: z.string(), paths: z.array(z.string()) }).strict(),
  z.object({ kind: z.literal('columns'), id: z.string() }).strict(),
  z.object({ kind: z.literal('columnType'), id: z.string() }).strict(),
])

/**
 * Work required to restore a change. `paper` and `project` hold the pre-change entity snapshot.
 * `trash` means the write moved an item to trash, so restoration puts that stored item back.
 * `created` means the write created a project that did not previously exist, so undo deletes it.
 * `pages` stores the previous full text of touched pages; restore rewrites them and deletes pages that
 * were previously absent. `option` reverses a column option rename from `from` to `to`. `columnType`
 * restores the previous column and every cell in it, then reinserts a group removed when converting
 * to text at `groupAt` (null means it was not grouped or the conversion was unrelated).
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
])

/**
 * Stored change record: cross-boundary fields plus restoration data. `target` identifies the changed
 * entity, `after` is its post-change fingerprint, and `restore` describes undo work. Restoration data
 * expires while the historical record remains. Seeded fixture rows predate this feature and use null,
 * an empty string, and null for those fields. `at` is the recorded epoch-millisecond timestamp at the
 * vault day's UTC midnight and drives retention. Only seeded history stores `meta`; newer rows derive
 * their date bucket from `at`. `archived` defaults to false for files written before archiving existed.
 * `date` is derived from `at` at read time rather than stored twice where it could drift.
 */
export const ChangeRecordSchema = ChangeEntrySchema
  .omit({ meta: true, undoable: true, date: true })
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

/** Where a write retains its previous entity: snapshot, trash, no prior entity, or an explicit restore operation. */
type Keep = 'snapshot' | 'trash' | 'created' | Restore

/**
 * Current entity shape. Naming and diffing distinguish entity kinds. Papers also carry a page snapshot
 * for undo because the cross-boundary row cannot distinguish an absent read state from an explicit
 * unread value. Column entities contain only that column for fingerprinting, while column-type entities
 * additionally contain every cell in the column across the library.
 */
type Entity =
  | { kind: 'paper'; paper: PaperRow; snapshot: PaperSnapshot }
  | { kind: 'project'; project: ProjectDetail }
  | { kind: 'pages'; pages: PageText[] }
  | { kind: 'columns'; column: PaperColumn }
  | { kind: 'columnType'; column: PaperColumn; cells: Record<string, PaperCell> }

/** Change-log storage: `.meridian` for real vaults and memory for fixtures. */
export type ChangeLogStore = {
  load(): ChangeRecord[]
  save(rows: ChangeRecord[]): void
  nextId(): string
}

/** Entity value without its kind, used for diffs and fingerprints. */
function valueOf(entity: Entity): Record<string, unknown> {
  switch (entity.kind) {
    case 'paper': return entity.paper
    case 'project': return Object.fromEntries(PROJECT_FIELDS.map((key) => [key, entity.project[key]]))
    case 'columns': return entity.column
    case 'columnType': return { ...entity.column, cells: entity.cells }
    default: return Object.fromEntries(entity.pages.map((p) => [p.path, p.text]))
  }
}

/** Diff for a type change: the column key and its previous and next types. */
const typeDiff = (key: string, from: PaperColumn['type'], to: PaperColumn['type']): string[] =>
  [`- ${key}: ${JSON.stringify(COLUMN_TYPE_LABEL[from])}`, `+ ${key}: ${JSON.stringify(COLUMN_TYPE_LABEL[to])}`]

/** JSON with sorted object keys so identical content always serializes identically for fingerprinting. */
function stableJson(value: unknown): string {
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

/**
 * Line-oriented diff between pre- and post-change entities. Equal keys emit nothing. Array values are
 * compared element by element, with removed entries as `-` and added entries as `+`. Other changed keys
 * emit the old value as `-` and the new value as `+`. A missing entity is empty, so creation emits only
 * additions and deletion only removals.
 */
function diffLines(before: Entity | undefined, after: Entity | undefined): string[] {
  const from = before === undefined ? {} : valueOf(before)
  const to = after === undefined ? {} : valueOf(after)
  const lines: string[] = []
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    const a = from[key]
    const b = to[key]
    if (stableJson(a) === stableJson(b)) continue
    if (Array.isArray(a) || Array.isArray(b)) {
      const left = (Array.isArray(a) ? a : []).map(stableJson)
      const dropped = [...left]
      const added = (Array.isArray(b) ? b : []).map(stableJson).filter((item) => {
        const at = dropped.indexOf(item)
        if (at < 0) return true
        dropped.splice(at, 1)
        return false
      })
      lines.push(...dropped.map((item) => `- ${key}: ${item}`))
      lines.push(...added.map((item) => `+ ${key}: ${item}`))
      continue
    }
    if (a !== undefined) lines.push(`- ${key}: ${stableJson(a)}`)
    if (b !== undefined) lines.push(`+ ${key}: ${stableJson(b)}`)
  }
  return lines
}

/**
 * Wraps the given operations so that every write that changes the vault's
 * lasting knowledge — the paper writes and the project writes, and a
 * proposal's writes, and none of the inbox, later-queue, watch, chat, feed or
 * trash writes — is recorded, and adds
 * the changelog reads and the undo the contract carries. Records are kept in
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
 * change of its own.
 */
export function withChangelog(ops: VaultOps, log: ChangeLogStore): VaultStore {
  let rows = log.load()

  /** Current vault time as epoch milliseconds at today's UTC midnight, shared by recording and retention. */
  const nowMs = (): number => Date.parse(`${ops.today()}T00:00:00Z`)

  /** Current entity shape, or undefined when it no longer exists; normal reads throw in that case. */
  const entityOf = (target: ChangeTarget): Entity | undefined => {
    try {
      switch (target.kind) {
        case 'paper':
          return { kind: 'paper', paper: ops.getPaper(target.id), snapshot: ops.paperSnapshot(target.id) }
        case 'project':
          return { kind: 'project', project: ops.getProject(target.id) }
        case 'pages':
          return { kind: 'pages', pages: ops.readPages(target.paths) }
        case 'columnType': {
          const column = ops.paperColumns().custom.find((c) => c.key === target.id)
          if (column === undefined) throw new Error(`论文表里没有这一列:${target.id}`)
          return { kind: 'columnType', column, cells: ops.paperCells(target.id) }
        }
        default: {
          const column = ops.paperColumns().custom.find((c) => c.key === target.id)
          if (column === undefined) throw new Error(`论文表里没有这一列:${target.id}`)
          return { kind: 'columns', column }
        }
      }
    } catch {
      return undefined
    }
  }

  /** Display name of an entity in a change title. */
  const nameOf = (entity: Entity): string => {
    switch (entity.kind) {
      case 'paper': return entity.paper.title
      case 'project': return entity.project.name
      case 'columns':
      case 'columnType': return entity.column.label
      default: return entity.pages.map((p) => p.path).join('、')
    }
  }

  /** Drop restoration snapshots after retention expires while keeping the records. */
  const dropExpired = (): void => {
    const cutoff = nowMs() - TRASH_RETENTION_DAYS * 86_400_000
    if (!rows.some((row) => row.restore !== null && row.at <= cutoff)) return
    rows = rows.map((row) => (row.restore !== null && row.at <= cutoff ? { ...row, restore: null } : row))
    log.save(rows)
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
    if (before === undefined) throw new Error('改动之前库里没有这个实体,存不下快照')
    switch (before.kind) {
      case 'paper': return { kind: 'paper', snapshot: before.snapshot }
      case 'project': return { kind: 'project', project: before.project }
      case 'pages': return { kind: 'pages', pages: before.pages }
      default: throw new Error('列这一类变动没有快照可存,还原要现成的那一份')
    }
  }

  /** Record one entry at the front of the log. */
  const push = (
    target: ChangeTarget, what: string, keep: Keep, before: Entity | undefined, diff?: string[],
  ): void => {
    const after = entityOf(target)
    const named = before ?? after
    if (!named) throw new Error('这次写的前后库里都没有这个实体,记不下它是什么')
    rows = [{
      id: log.nextId(),
      title: target.kind === 'pages' || target.kind === 'columns' || target.kind === 'columnType'
        ? what
        : `${target.kind === 'paper' ? '论文' : '项目'}「${nameOf(named)}」· ${what}`,
      meta: null,
      source: BY_ME,
      diff: diff ?? diffLines(before, after),
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

  /** Project write that records the entire pre-change project. */
  const onProject = <T>(id: string, what: string, write: () => T): T =>
    wrote({ kind: 'project', id }, what, 'snapshot', write)

  /** Paper-field write that records the paper's pre-change shape. */
  const updatePaper = (id: string, patch: Partial<PaperFields>): void =>
    wrote({ kind: 'paper', id }, '改了字段', 'snapshot', () => ops.updatePaper(id, patch))

  /** Clear and record cells incompatible with current columns; do nothing when every cell still fits. */
  const dropMisfits = (id: string): void => {
    const misfits = misfitCells(ops.paperColumns(), ops.getPaper(id), {})
    if (misfits.length === 0) return
    updatePaper(id, { custom: Object.fromEntries(misfits.map(({ column }) => [column.key, null])) })
  }

  return {
    ...ops,

    updatePaper,

    renamePaperOption(key, from, to) {
      const column = ops.paperColumns().custom.find((c) => c.key === key)
      if (!column) throw new Error(`论文表里没有这一列:${key}`)
      return wrote(
        { kind: 'columns', id: key },
        `论文表 · 列「${column.label}」的选项 ${from} → ${to}`,
        { kind: 'option', key, from: to, to: from },
        () => ops.renamePaperOption(key, from, to),
        [`- ${key}: ${JSON.stringify(from)}`, `+ ${key}: ${JSON.stringify(to)}`],
      )
    },

    setPaperColumnType(key, type) {
      const target: ChangeTarget = { kind: 'columnType', id: key }
      const before = entityOf(target)
      if (before?.kind !== 'columnType') throw new Error(`论文表里没有这一列:${key}`)
      const groupAt = ops.paperColumns().groups.indexOf(key)
      ops.setPaperColumnType(key, type)
      push(
        target,
        `论文表 · 列「${before.column.label}」的类型 ${COLUMN_TYPE_LABEL[before.column.type]} → ${COLUMN_TYPE_LABEL[type]}`,
        { kind: 'columnType', column: before.column, groupAt: type === 'text' && groupAt >= 0 ? groupAt : null, cells: before.cells },
        before,
        typeDiff(key, before.column.type, type),
      )
    },

    deletePaper(id) {
      return wrote({ kind: 'paper', id }, '删掉', 'trash', () => ops.deletePaper(id))
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

    deleteProject(id) {
      return wrote({ kind: 'project', id }, '删掉', 'trash', () => ops.deleteProject(id))
    },

    createTask(projectId, task) {
      return onProject(projectId, '新增任务', () => ops.createTask(projectId, task))
    },

    updateTask(projectId, taskId, patch) {
      return onProject(projectId, '改了任务', () => ops.updateTask(projectId, taskId, patch))
    },

    deleteTask(projectId, taskId) {
      return onProject(projectId, '删掉任务', () => ops.deleteTask(projectId, taskId))
    },

    createMilestone(projectId, milestone) {
      return onProject(projectId, '新增里程碑', () => ops.createMilestone(projectId, milestone))
    },

    updateMilestone(projectId, milestoneId, patch) {
      return onProject(projectId, '改了里程碑', () =>
        ops.updateMilestone(projectId, milestoneId, patch))
    },

    deleteMilestone(projectId, milestoneId) {
      return onProject(projectId, '删掉里程碑', () => ops.deleteMilestone(projectId, milestoneId))
    },

    createRelation(projectId, relation) {
      return onProject(projectId, '新增关联', () => ops.createRelation(projectId, relation))
    },

    deleteRelation(projectId, relationId) {
      return onProject(projectId, '删掉关联', () => ops.deleteRelation(projectId, relationId))
    },

    addPaper(projectId, paperId) {
      return onProject(projectId, '关联论文', () => ops.addPaper(projectId, paperId))
    },

    removePaper(projectId, paperId) {
      return onProject(projectId, '移除关联论文', () => ops.removePaper(projectId, paperId))
    },

    moveRelation(projectId, id, index) {
      return onProject(projectId, '调整关联顺序', () => ops.moveRelation(projectId, id, index))
    },

    createAttachment(projectId, attachment) {
      return onProject(projectId, '新增附件', () => ops.createAttachment(projectId, attachment))
    },

    deleteAttachment(projectId, attachmentId) {
      return wrote({ kind: 'project', id: projectId }, '删掉附件', 'trash', () =>
        ops.deleteAttachment(projectId, attachmentId))
    },

    createEvent(projectId, text, node) {
      return onProject(projectId, '新增科研记录', () => ops.createEvent(projectId, text, node))
    },

    recordAction(id, messageId) {
      const action = ops.chatMessages(id).find((message) => message.id === messageId)?.actions[0]
      return action === undefined
        ? ops.recordAction(id, messageId)
        : onProject(action.project, '新增科研记录', () => ops.recordAction(id, messageId))
    },

    writeBack(id, node, page, text) {
      const name = ops.getProject(id).name
      const title = ops.wikiAggregation(page).title
      const section = ops.wikiSections()[0] ?? ''
      const paths = [page, `${PROJECTS_DIR}/${id}`]
      return wrote(
        { kind: 'pages', id: paths.join('\n'), paths },
        `项目「${name}」· 写回 ${title}`,
        'snapshot',
        () => ops.writeBack(id, node, page, text),
        [
          describeOp({ op: 'appendEntry', page, section, date: ops.today(), text }),
          `+ ${node} ↦ ${page}`,
        ],
      )
    },

    applyProposal(proposal) {
      const paths = ops.proposalPages(proposal)
      return wrote(
        { kind: 'pages', id: paths.join('\n'), paths },
        `Wiki · ${proposal.title}`,
        'snapshot',
        () => ops.applyProposal(proposal),
        proposal.ops.map(describeOp),
      )
    },

    updateWikiPage(id, body) {
      const title = id.startsWith(PAPER_PAGE) ? ops.wikiPaper(id).title : ops.wikiAggregation(id).title
      return wrote({ kind: 'pages', id, paths: [id] }, `Wiki · 「${title}」· 改了正文`, 'snapshot', () => ops.updateWikiPage(id, body), [`~ ${id}`])
    },

    listChanges() {
      dropExpired()
      const day = ops.today()
      return rows.map((row): ChangeEntry => {
        const date = new Date(row.at).toISOString().slice(0, 10)
        return {
          id: row.id,
          title: row.title,
          meta: row.meta ?? dayOf(date, day),
          date,
          source: row.source,
          diff: [...row.diff],
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
      if (!row) throw new Error(`最近变动里没有这一条:${id}`)
      if (row.undone) throw new Error('这一条已经撤销过了')
      const { target, restore } = row
      if (target === null) throw new Error('这一条撤不了:库里没有还原它所需的东西')
      if (restore === null) {
        throw new Error(`这一条的快照已过 ${TRASH_RETENTION_DAYS} 天保留期,撤不了了`)
      }

      const before = entityOf(target)
      if (fingerprint(before) !== row.after) {
        // Newer records are at the front, so every record newer than this one precedes it.
        const newer = rows.slice(0, at)
          .filter((r) => !r.undone && r.target?.kind === target.kind && r.target.id === target.id)
        throw new Error(newer.length > 0
          ? `这条之后该实体又被改过 ${newer.length} 次,先撤销较新的那几条`
          : target.kind === 'columns' || target.kind === 'columnType'
            ? '这一列之后又改过,撤销会盖掉那次改动'
            : '这条之后该实体已经不是当时的样子,撤销会盖掉那次改动,所以拒绝')
      }

      if (restore.kind === 'paper') {
        // A later column type or option change may reject snapshot values and make future column edits impossible.
        const held = ops.getPaper(target.id)
        const misfit = misfitCells(ops.paperColumns(), { ...held, custom: restore.snapshot.custom }, held.custom)[0]
        if (misfit !== undefined) {
          throw new Error(
            `这篇论文的「${misfit.column.label}」列之后改过类型或选项,撤销会写进这一列现在放不下的值`, { cause: misfit.cause },
          )
        }
      }

      if (restore.kind === 'trash') ops.restoreTrash(restore.entry)
      else if (restore.kind === 'created') ops.deleteProject(target.id)
      else if (restore.kind === 'paper') ops.putPaper(target.id, restore.snapshot)
      else if (restore.kind === 'option') ops.renamePaperOption(restore.key, restore.from, restore.to)
      else if (restore.kind === 'columnType') ops.putPaperColumn(restore.column, restore.groupAt, restore.cells)
      else if (restore.kind === 'pages') ops.putPages(restore.pages)
      else ops.putProject(restore.project)

      rows = rows.map((r) => (r.id === id ? { ...r, undone: true } : r))
      const after = entityOf(target)
      rows = [{
        id: log.nextId(),
        title: `撤销:${row.title}`,
        meta: null,
        source: BY_ME,
        // Proposal targets hold full page text; a normal line diff would copy every page verbatim into the record.
        diff: restore.kind === 'pages'
          ? restore.pages.map((p) => `~ ${p.path}`)
          : restore.kind === 'columnType' && before?.kind === 'columnType'
            ? typeDiff(target.id, before.column.type, restore.column.type)
            : diffLines(before, after),
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
      if (!row) throw new Error(`最近变动里没有这一条:${id}`)
      if (row.archived) return
      rows = rows.map((r) => (r.id === id ? { ...r, archived: true } : r))
      log.save(rows)
    },

    archiveAllChanges() {
      if (rows.every((r) => r.archived)) return
      rows = rows.map((r) => (r.archived ? r : { ...r, archived: true }))
      log.save(rows)
    },

    deleteChange(id) {
      if (!rows.some((row) => row.id === id)) throw new Error(`最近变动里没有这一条:${id}`)
      rows = rows.filter((row) => row.id !== id)
      log.save(rows)
    },

    clearArchivedChanges() {
      if (!rows.some((row) => row.archived)) return
      rows = rows.filter((row) => !row.archived)
      log.save(rows)
    },
  }
}
