import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import type { z } from 'zod'
import type {
  ChatSession, Conclusion, DeliverySettings, FeedRun, GraphNode, PaperColumns, PaperImportResult, PaperReading, PaperRow, Proposal,
  ProjectDetail, ProjectWorkspaceBinding, ReadingMutation, ResearchIdea, SearchHit, Task, TaskFields,
} from '../shared/contract.js'
import { DEFAULT_DELIVERY_SETTINGS, FeedEntrySchema, ResearchIdeaSchema, WatchSchema } from '../shared/contract.js'
import { projectControlState } from '../shared/project-control.js'
import { topicDir, topicProposal } from '../shared/topic-proposal.js'
import {
  ACTIVE_PROJECT, CHAT_EVENT_PREFIX, FINISHED_PROJECT, PAPER_PAGE, PROJECTS_DIR, READ_STATES, SEARCH_LIMIT,
  TRASH_RETENTION_DAYS, UNREAD_PAPER,
} from '../shared/vocabulary.js'
import type { ChangeRecord } from './changelog.js'
import { ChangeRecordSchema, PROJECT_FIELDS, withChangelog } from './changelog.js'
import { dayOf, systemToday } from './dates.js'
import {
  applyReadingMutation, checkColumns, checkCustom, checkGroupKey, columnCells, emptyColumns,
  emptyPaperReading, facetPapers, freePageStem, laterWithMetadata, listPapers, liveColumns,
  missingMetadata, paperImportResult, parsePaperUpload, patchedCustom, readingNoteCount,
  remoteMetadata, renamedCell, renamedOptions, restoredColumn, retypedColumn, writePaperFields,
  type PaperWrite,
} from './paper-library/index.js'
import {
  chatSource, conclusionCounts, MANUAL_SOURCE, overviewResearch, paperLabel, placeNode,
  projectPageText, projectWorkspaceRoot, projectWorkspaceSsh, readProjectPage,
  readProjectWorkspace, readWorkspaceAgentIdeas, withProjectLinks, writeProjectFields,
  writeProjectWorkspaceState, type ProjectRecord,
} from './project-management/index.js'
import { inboxFields, unseenPapers } from './inbox/dedup.js'
import {
  applyRecommendationPreferences, buildRecommendationProfile, clusterRecommendationProfile,
  discoveryReasons, orderInbox, recommendationSeedIds,
  type DiscoveryPaper, type DiscoveryPreferences,
} from './recommendation/index.js'
import type { Json } from './vault/frontmatter.js'
import { emitKey } from './vault/frontmatter.js'
import type {
  ChatRecord, InboxRecord, PaperSnapshot, TrashRecord, VaultState,
} from './vault/records.js'
import {
  ChatRecordSchema, InboxRecordSchema, LaterRecordSchema, PaperReadingRecordSchema,
  TrashRecordSchema, VaultStateSchema,
} from './vault/records.js'
import {
  movePage, removePage, replacePage, writeImmutable, writeJson, writePage,
} from './vault/writer.js'
import type { MetadataFill, VaultOps, VaultStore } from './vault.js'
import {
  appendEntry, applyProposal, checkBody, checkGenerated, createAggregationPage, entryLine,
  fillGenerated, generatedChildren, generatedTable, isPaper, readWikiData, readWikiPage,
  removeMembership, setAggregationMetadata, setBody, setBodyAndTrust, setColumns, setMembership,
  setParents, setUpdated, touchedPages, wikiAggregation, wikiCards, wikiHome, wikiPaper, wikiSearchIndex,
  type WikiAggregationRecord, type WikiData, type WikiPaperRecord,
} from './wiki/index.js'
import { prepareFallbackLibrary } from './workspace-layout.js'
import { createResearchIdea, updateResearchIdea } from './research-ideas/index.js'

/** Page frontmatter: scalars are strings, sequences are string arrays, and blocks are string maps. */
type Frontmatter = Record<string, string | string[] | Record<string, string | string[]>>

/** A page read while scanning a directory. */
type Scanned = { id: string; file: string; front: Frontmatter; body: string }

/** Vault ID prefix used by page readers and writers to recognize project pages. */
const PROJECT_PATH = `${PROJECTS_DIR}/`

/**
 * Stores the half of application state that is not compiled knowledge: chats,
 * inbox, read-later queue, watches, feed, recent changes, and trash. These are
 * JSON records and never enter the Markdown knowledge index.
 */
const MERIDIAN = '.meridian'

/**
 * Partial page output lands here before replacing the destination atomically
 * on the same volume. Keeping staging app-owned prevents debris in the user's
 * knowledge directories; stale output is cleared when the vault opens.
 */
const STAGING = 'tmp'

/** Number of research-log entries included in a project summary. */
const RECENT_EVENTS = 3

/** Character limit used when an untitled demo chat derives its name from the first user message. */
const CHAT_TITLE_CHARS = 12

/** Legacy display time retained while old feed records migrate to exact timestamps. */
const FEED_NOW = '刚刚'

/** Default number of days in a newly created demo project's schedule. */
const NEW_PROJECT_SPAN_DAYS = 30

/** Page state for an imported paper whose wiki content has not yet been compiled. */
const NEW_PAPER_PAGE_STATE = 'draft'

/** Decodes a quoted scalar as JSON and returns an unquoted scalar unchanged. */
const unquote = (value: string): string => (value.startsWith('"') ? JSON.parse(value) as string : value)

/** Returns a scalar frontmatter value, or an empty string when the key is not scalar. */
const scalar = (front: Frontmatter, key: string): string => {
  const value = front[key]
  return typeof value === 'string' ? value : ''
}

/** Returns a list frontmatter value, or an empty array when the key is not a list. */
const list = (front: Frontmatter, key: string): string[] => {
  const value = front[key]
  return Array.isArray(value) ? value : []
}

/** Returns a copied map frontmatter value, or an empty map when the key is not a map. */
const mapOf = (front: Frontmatter, key: string): Record<string, string | string[]> => {
  const value = front[key]
  if (typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of Object.entries(value)) out[k] = Array.isArray(v) ? [...v] : v
  return out
}

/**
 * Splits a vault page into its frontmatter and its body. The vault writes
 * frontmatter as `key: "value"`, and as `key:` followed by lines indented under
 * it — `- "item"` for a list, `k: "v"` for a map, a map's key carrying no value
 * taking the column of `- "item"` lines indented under it as its own value —
 * and writes some pages with CRLF endings, which this strips. Throws if the
 * page carries no closed frontmatter block.
 */
function splitPage(text: string): { front: Frontmatter; body: string } {
  const lines = text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1
  if (end < 0) throw new Error('页面没有收口的 frontmatter')
  const front: Frontmatter = {}
  let key = ''
  let items: string[] | undefined
  let block: Record<string, string | string[]> | undefined
  // Collects list items nested under a map key; `items` yields first, so both are never active together.
  let nested: string[] | undefined
  for (const line of lines.slice(1, end)) {
    const item = /^\s+-\s*(.*)$/.exec(line)
    const into = nested ?? items
    if (item && into) {
      into.push(unquote(item[1]!))
      continue
    }
    const under = /^\s+([A-Za-z0-9_][\w-]*):\s*(.*)$/.exec(line)
    // An indented `k: v` before any `- ` item means this key contains a map rather than a list.
    if (under && (block !== undefined || items?.length === 0)) {
      block ??= {}
      const value = under[2]!
      nested = value === '' ? [] : undefined
      block[under[1]!] = nested ?? (value === '[]' ? [] : unquote(value))
      front[key] = block
      items = undefined
      continue
    }
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!pair) continue
    const value = pair[2]!
    key = pair[1]!
    block = undefined
    nested = undefined
    if (value === '' || value === '[]') {
      items = []
      front[key] = items
    } else {
      items = undefined
      front[key] = unquote(value)
    }
  }
  return { front, body: lines.slice(end + 1).join('\n') }
}

/** The filename and contents of a vault page. */
function readPage(file: string): Scanned {
  const name = basename(file)
  return { id: name.slice(0, -'.md'.length), file, ...splitPage(readFileSync(file, 'utf8')) }
}

/** Reads every page in a directory, sorted by filename as this implementation's vault order. */
function scan(dir: string): Scanned[] {
  return readdirSync(dir).filter((name) => name.endsWith('.md')).sort()
    .map((name) => readPage(join(dir, name)))
}

/**
 * Builds the contract row for a paper page. Topics and methods come from its
 * memberships in the two aggregation kinds; year and venue come from the page;
 * page state comes from `status` or an empty string; counts absent from the
 * vault are initialized to zero.
 */
function paperRowOf(data: WikiData, id: string, page: WikiPaperRecord): PaperRow {
  const titles = (kind: string): string[] => (page.fm.memberships ?? [])
    .filter((m) => data.pages[m.in]?.kind === kind)
    .map((m) => (data.pages[m.in] as WikiAggregationRecord).fm.title)
  const fm = page.fm as WikiPaperRecord['fm'] & { status?: string; read_state?: string; page_count?: number }
  const addedAt = typeof fm.added_at === 'string'
    ? fm.added_at
    : `${fm.created ?? fm.updated}T00:00:00.000Z`
  return {
    id,
    title: fm.title,
    ...(fm.short === undefined ? {} : { shortTitle: fm.short }),
    ...(fm.authors === undefined ? {} : { authors: fm.authors }),
    ...(fm.year === undefined ? {} : { year: fm.year }),
    venue: fm.venue ?? '',
    ...(fm.rating === undefined ? {} : { rating: fm.rating }),
    ...(fm.identifier === undefined ? {} : { identifier: fm.identifier }),
    ...(fm.submitted === undefined ? {} : { submitted: fm.submitted }),
    ...(fm.abstract === undefined ? {} : { abstract: fm.abstract }),
    topics: titles('topic'),
    methods: titles('method'),
    datasets: [],
    metrics: [],
    pageState: fm.status ?? '',
    readState: READ_STATES.find((s) => s === fm.read_state) ?? UNREAD_PAPER,
    projects: [],
    pageCount: typeof fm.page_count === 'number' ? fm.page_count : 0,
    noteCount: 0,
    conclusionCount: 0,
    addedAt,
    updated: String(fm.updated),
    custom: page.fm.custom ?? {},
  }
}

/**
 * Builds a paper page created during import using the aggregation layout. It
 * starts outside every aggregation with empty `memberships`; bibliography data
 * is unavailable at this stage and is omitted.
 */
function newPaperPageText(
  id: string, title: string, readState: string, today: string, addedAt: string,
): string {
  const front: [string, Json][] = [
    ['type', 'paper'],
    ['title', title],
    ['status', NEW_PAPER_PAGE_STATE],
    ['created', today],
    ['added_at', addedAt],
    ['updated', today],
    ['source_id', id],
    ['read_state', readState],
    ['memberships', []],
  ]
  return ['---', ...front.flatMap(([key, value]) => emitKey(key, value, '')), '---', ''].join('\n')
}

/** Throws when a task date range or time window is reversed. */
function checkSpan(task: TaskFields): void {
  // The contract guarantees fixed-width ISO dates, so lexical order is chronological order.
  if (task.end < task.start) throw new Error(`任务结束日期早于开始日期:${task.start} – ${task.end}`)
  if (task.start === task.end && task.window && task.window.end <= task.window.start) {
    throw new Error(`任务结束时间不晚于开始时间:${task.window.start} – ${task.window.end}`)
  }
}

/** Throws when a research-log entry contains a newline. */
function checkOneLine(text: string): void {
  if (text.includes('\n')) throw new Error('科研记录一条占一行,正文里不能有换行')
}

/** Project order: creation date first, then numeric-aware IDs so `project-2` precedes `project-10`. */
function byCreated(a: ProjectRecord, b: ProjectRecord): number {
  return a.created === b.created
    ? a.id.localeCompare(b.id, undefined, { numeric: true })
    : a.created.localeCompare(b.created)
}

/**
 * Applies a stored manual order over `items`: ids named in `order` come first, in that order;
 * every other item keeps its existing relative order after them. Ids in `order` with no matching
 * item are ignored.
 */
function applyOrder<T>(items: readonly T[], order: readonly string[] | undefined, idOf: (item: T) => string): T[] {
  if (order === undefined) return [...items]
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...items].sort((a, b) => {
    const ai = rank.get(idOf(a))
    const bi = rank.get(idOf(b))
    if (ai === undefined && bi === undefined) return 0
    if (ai === undefined) return 1
    if (bi === undefined) return -1
    return ai - bi
  })
}

/**
 * Returns whether the vault at the given root is under git. Undo rests on git
 * history, so a vault outside it has no safety net under any later write.
 */
export function isGitManaged(root: string): boolean {
  return existsSync(join(root, '.git'))
}

/**
 * Opens the app-owned fallback library, creating only the minimal durable
 * Paper Wiki directories when it is new. Configured user vaults still go
 * through createVaultStore and are never silently repaired or reshaped here.
 */
export function createDesktopVaultStore(
  root: string, today: () => string = systemToday, now: () => Date = () => new Date(),
  appliedProposalBodies: Map<string, string> = new Map(),
): VaultStore {
  prepareFallbackLibrary(root)
  return createVaultStore(root, today, now, appliedProposalBodies)
}

/**
 * Builds a VaultStore over the vault at `root`. The knowledge the vault holds —
 * its papers, its aggregation layout read from `wiki/schema.yaml` and the pages,
 * and the search over them — is read off disk,
 * the projects are read from the pages under `wiki/projects`, and the run state
 * the contract carries — inbox, later queue, watches, chats, feed, changelog
 * and trash — from the JSON files under `.meridian`, both of which this creates
 * as it first writes to them. `today` supplies the vault's today, which dates
 * every write and from which the trash counts its retention; it defaults to the
 * system date. `now` supplies the exact timestamp written once when a paper is
 * added, independently of later metadata edits. Frontmatter is scanned once here and page bodies are read on
 * demand, so a page written outside this store after this call is not seen.
 * Whether the vault is under git is checked here and, when the answer is not
 * the one the vault was last told, recorded in the feed. Throws, before writing anything, naming
 * the missing directory when `root` has no `wiki/papers`. It throws the same
 * way, naming the missing file, when `root` has no `wiki/schema.yaml`.
 * `appliedProposalBodies` is the Harness proposal audit's most recent applied body per target id; the
 * composition root reads it, since only it may reach into Harness. It drives the one-time trust-state
 * migration below and defaults to empty, which makes the migration a no-op.
 */
export function createVaultStore(
  root: string, today: () => string = systemToday, now: () => Date = () => new Date(),
  appliedProposalBodies: Map<string, string> = new Map(),
): VaultStore {
  const wiki = join(root, 'wiki')
  const paperDir = join(wiki, 'papers')
  if (!existsSync(paperDir)) throw new Error(`库里没有论文页目录:${paperDir}`)
  /** Vault aggregation structure, reread from pages after every wiki write. */
  let wikiData = readWikiData(wiki)
  const meridian = join(root, MERIDIAN)
  const projectDir = join(wiki, PROJECTS_DIR)
  const staging = join(meridian, STAGING)
  const projectFile = (id: string): string => join(projectDir, `${id}.md`)
  const trashPage = (id: string): string => join(meridian, 'trash', `${id}.md`)

  /**
   * One-time trust-state migration for libraries built before Core wrote validation_state and
   * trust_state on apply: a paper page missing either key whose body still matches the most recent
   * Harness `applied` event recorded for it gets both keys set, through the same writer applying a
   * proposal uses. A page whose body has since diverged, or that was never applied through Harness, is
   * left alone. Idempotent — nothing to migrate the second time this runs.
   */
  const migrateAppliedTrust = (): void => {
    let migrated = false
    for (const [id, page] of Object.entries(wikiData.pages)) {
      if (!isPaper(page) || (page.fm.validation_state !== undefined && page.fm.trust_state !== undefined)) continue
      const applied = appliedProposalBodies.get(id.slice(PAPER_PAGE.length))
      if (applied === undefined || applied.trim() !== page.body) continue
      setBodyAndTrust(join(wiki, `${id}.md`), page.body, staging)
      migrated = true
    }
    if (migrated) wikiData = readWikiData(wiki)
  }
  migrateAppliedTrust()

  /** Loads the record list in `.meridian/<name>.json`, or an empty list when the file does not exist. */
  const load = <T>(name: string, schema: z.ZodType<T>): T[] => {
    const file = join(meridian, `${name}.json`)
    if (!existsSync(file)) return []
    return schema.array().parse(JSON.parse(readFileSync(file, 'utf8')))
  }
  const save = (name: string, rows: unknown): void => writeJson(join(meridian, `${name}.json`), rows, staging)

  // Remove partial output from the previous run; destination pages were never modified and the debris is no longer useful.
  rmSync(staging, { recursive: true, force: true })

  const stateFile = join(meridian, 'state.json')
  let state: VaultState = existsSync(stateFile)
    ? VaultStateSchema.parse(JSON.parse(readFileSync(stateFile, 'utf8')))
    : { seq: 0 }

  /** Returns an unused vault ID from a monotonically increasing sequence that survives restarts. */
  const nextId = (prefix: string): string => {
    state = { ...state, seq: state.seq + 1 }
    writeJson(stateFile, state, staging)
    return `${prefix}-${state.seq}`
  }

  let inbox = load('inbox', InboxRecordSchema)
  let later = load('later', LaterRecordSchema)
  let watches = load('watches', WatchSchema)
  let chats = load('chats', ChatRecordSchema)
  const hadIdeasFile = existsSync(join(meridian, 'ideas.json'))
  let ideas = load('ideas', ResearchIdeaSchema)
  const feedFile = join(meridian, 'feed.json')
  let feed = load('feed', FeedEntrySchema)
  // Older builds persisted a literal relative-time label, so those records could never age on
  // screen. The file modification time is the closest durable timestamp available for that legacy
  // batch. Persist it once; future appends always carry their exact creation timestamp.
  if (feed.some((entry) => entry.createdAt === undefined && entry.time === FEED_NOW)) {
    const legacyCreatedAt = statSync(feedFile).mtime.toISOString()
    feed = feed.map((entry) => (
      entry.createdAt === undefined && entry.time === FEED_NOW
        ? { ...entry, createdAt: legacyCreatedAt }
        : entry
    ))
    save('feed', feed)
  }
  let trash = load('trash', TrashRecordSchema)
  let readings = load('paper-readings', PaperReadingRecordSchema)

  // Older versions left watch-derived recommendations in inbox.json after a watch was removed.
  // They have no reachable sidebar destination and pollute the combined feed and deduplication history, so remove them on open.
  const knownWatches = new Set(watches.map((watch) => watch.id))
  const orphanInbox = new Set(
    inbox.filter((entry) => entry.kind === 'watch' && !knownWatches.has(entry.watch))
      .map((entry) => entry.id),
  )
  if (orphanInbox.size > 0) {
    inbox = inbox.filter((entry) => !orphanInbox.has(entry.id))
    const nextTrash = trash.filter((item) => item.kind !== 'inbox' || !orphanInbox.has(item.entryId))
    save('inbox', inbox)
    if (nextTrash.length !== trash.length) {
      trash = nextTrash
      save('trash', trash)
    }
  }

  const projectById = new Map<string, ProjectRecord>(
    (existsSync(projectDir) ? readdirSync(projectDir).filter((n) => n.endsWith('.md')) : [])
      .map((name) => {
        const id = name.slice(0, -'.md'.length)
        return [id, readProjectPage(join(projectDir, name), id)]
      }),
  )

  const orphanDiscoveries = new Set(
    inbox.filter((entry) => entry.kind === 'discovery' && !projectById.has(entry.project))
      .map((entry) => entry.id),
  )
  if (orphanDiscoveries.size > 0) {
    inbox = inbox.filter((entry) => !orphanDiscoveries.has(entry.id))
    trash = trash.filter((item) => item.kind !== 'inbox' || !orphanDiscoveries.has(item.entryId))
    save('inbox', inbox)
    save('trash', trash)
  }

  const paperScan = scan(paperDir)

  /** Every paper page in the vault, keyed by its filename-derived ID. */
  const papers = new Map<string, PaperRow>()

  /** Reading interaction for a paper, returning an unshared empty state when no record exists. */
  const readingOf = (id: string): PaperReading => structuredClone(
    readings.find((reading) => reading.paperId === id) ?? emptyPaperReading(id),
  )

  /** Projects sidecar note counts and remarks onto the paper table without changing source metadata. */
  const withReadingCount = (row: PaperRow): PaperRow => {
    const reading = readingOf(row.id)
    return {
      ...row,
      noteCount: row.noteCount + readingNoteCount(reading),
      ...(reading.remark === '' ? {} : { remark: reading.remark }),
    }
  }

  /** Paper pages referencing each immutable source, in vault order; duplicates are legal, so each source maps to a list. */
  const pagesOf = new Map<string, string[]>()

  /** Indexes a paper page by filename in the table and by its `source_id` for source lookup. */
  const indexPaper = (page: Scanned): void => {
    papers.set(page.id, withReadingCount(paperRowOf(
      wikiData, page.id, readWikiPage(page.file, null) as WikiPaperRecord,
    )))
    const source = scalar(page.front, 'source_id')
    if (source) pagesOf.set(source, [...(pagesOf.get(source) ?? []), page.id])
  }

  /** Removes a paper page from both indexes; `source` identifies its immutable source. */
  const unindexPaper = (id: string, source: string): void => {
    papers.delete(id)
    const rest = (pagesOf.get(source) ?? []).filter((stem) => stem !== id)
    if (rest.length === 0) pagesOf.delete(source)
    else pagesOf.set(source, rest)
  }

  /** Resolves a paper page file. */
  const paperFile = (id: string): string => join(wiki, 'papers', `${id}.md`)

  /** Resolves a wiki page file whose `id` is its vault-relative path. */
  const wikiFile = (id: string): string => join(wiki, `${id}.md`)

  /**
   * Returns aggregation IDs whose generated regions must be refilled after a
   * proposal, in first-seen order: membership targets; each new aggregation and
   * its parents; pages targeted by `setColumns`; and old and new parents of a
   * `setParents` target. Renaming can affect parent child-links and derived links
   * in other aggregation tables, so it refills every aggregation, plus every
   * current aggregation of a modified paper in `next`. `before` supplies old parents.
   */
  const refilled = (proposal: Proposal, before: WikiData, next: WikiData): string[] => {
    const out: string[] = []
    const add = (id: string): void => { if (!out.includes(id)) out.push(id) }
    for (const op of proposal.ops) {
      if (op.op === 'setMembership' || op.op === 'removeMembership') add(op.in)
      if (op.op === 'createAggregation') {
        add(op.id)
        for (const parent of op.parents) add(parent)
      }
      if (op.op === 'setColumns') add(op.page)
      if (op.op === 'setAggregationMetadata') {
        for (const [id, page] of Object.entries(next.pages)) if (!isPaper(page)) add(id)
      }
      if (op.op === 'setParents') {
        for (const parent of (before.pages[op.page] as WikiAggregationRecord | undefined)?.fm.parents ?? []) add(parent)
        for (const parent of op.parents) add(parent)
      }
    }
    for (const op of proposal.ops) {
      if (op.op !== 'setMembership' && op.op !== 'removeMembership') continue
      for (const m of (next.pages[op.paper] as WikiPaperRecord).fm.memberships ?? []) add(m.in)
    }
    return out
  }

  /** Rereads wiki structure after a write and recomputes table rows for the affected paper pages. */
  const rereadWiki = (paths: string[]): void => {
    wikiData = readWikiData(wiki)
    for (const path of paths) {
      if (!path.startsWith(PAPER_PAGE)) continue
      const stem = path.slice(PAPER_PAGE.length)
      const page = wikiData.pages[path]
      if (page === undefined) papers.delete(stem)
      else papers.set(stem, paperRowOf(wikiData, stem, page as WikiPaperRecord))
    }
  }

  /** Returns the immutable source referenced by a paper page, or an empty string without `source_id`. */
  const sourceOf = (id: string): string => scalar(readPage(paperFile(id)).front, 'source_id')

  /** Refreshes a paper record in aggregation data from disk, or removes it when `file` is null. */
  const refreshWikiPage = (id: string, file: string | null): void => {
    const pages = { ...wikiData.pages }
    if (file === null) delete pages[PAPER_PAGE + id]
    else pages[PAPER_PAGE + id] = readWikiPage(file, null)
    wikiData = { ...wikiData, pages }
  }

  /** Captures a paper page, omitting read state when the page has no `read_state` field. */
  const snapshotOf = (front: Frontmatter): PaperSnapshot => ({
    title: scalar(front, 'title'),
    ...(front['short'] === undefined ? {} : { shortTitle: scalar(front, 'short') }),
    ...(front['authors'] === undefined ? {} : { authors: list(front, 'authors') }),
    ...(front['year'] === undefined ? {} : { year: Number(scalar(front, 'year')) }),
    venue: scalar(front, 'venue'),
    ...(front['rating'] === undefined ? {} : { rating: Number(scalar(front, 'rating')) }),
    ...(front['identifier'] === undefined ? {} : { identifier: scalar(front, 'identifier') }),
    ...(front['submitted'] === undefined ? {} : { submitted: scalar(front, 'submitted') }),
    topics: list(front, 'topics'),
    ...(front['read_state'] === undefined
      ? {}
      : { readState: READ_STATES.find((s) => s === scalar(front, 'read_state')) ?? UNREAD_PAPER }),
    updated: scalar(front, 'updated'),
    custom: mapOf(front, 'custom'),
  })

  /** Writes paper fields and reindexes the saved page so writes and list reads cannot diverge. */
  const writePaper = (id: string, fields: PaperWrite): void => {
    const file = paperFile(id)
    writePaperFields(file, fields, staging)
    refreshWikiPage(id, file)
    papers.set(id, withReadingCount(paperRowOf(
      wikiData, id, wikiData.pages[PAPER_PAGE + id] as WikiPaperRecord,
    )))
  }

  /**
   * Inbox and read-later records store the immutable source ID. When a vault
   * page references it, returns the first such page in vault order so the UI
   * can open the source through that page; otherwise returns only the source ID.
   */
  const paperOf = (source: string): string => pagesOf.get(source)?.[0] ?? source

  for (const page of paperScan) indexPaper(page)

  // Legacy "save as idea" records stored only an excerpt in the chat. On the first open in the new version,
  // migrate them into standalone idea records. Run only when the file never existed so deleted ideas stay deleted.
  if (!hadIdeasFile) {
    const migrated = chats.flatMap((chat) => {
      if (chat.idea === undefined) return []
      const paper = chat.paperId === undefined ? undefined : papers.get(chat.paperId)
      return [createResearchIdea(
        nextId('idea'),
        `继续验证：${paper?.title ?? chat.title}`.slice(0, 160),
        chat.idea.first,
        {
          chatId: chat.id,
          chatTitle: chat.title,
          ...(paper === undefined ? {} : { paperId: paper.id, paperTitle: paper.title }),
        },
        today(),
      )]
    })
    if (migrated.length > 0) {
      ideas = migrated
      save('ideas', ideas)
    }
  }

  /** Current vault time as UTC midnight, used for deletion timestamps and trash retention. */
  const nowMs = (): number => Date.parse(`${today()}T00:00:00Z`)

  /** Returns a project by ID. Throws when the vault has no such project. */
  const projectOf = (id: string): ProjectRecord => {
    const project = projectById.get(id)
    if (!project) throw new Error(`项目不存在:${id}`)
    return project
  }

  /** Builds the cross-boundary project detail, deriving paper counts and titles from current vault state. */
  const detailOf = (project: ProjectRecord): ProjectDetail => {
    const stored: Omit<ProjectRecord, 'created'> & { created?: string } = structuredClone(project)
    delete stored.created
    delete stored.workspaceRoot
    delete stored.workspaceSsh
    const paperTitles = Object.fromEntries(stored.papers.flatMap((id) => {
      const paper = papers.get(id)
      return paper === undefined ? [] : [[id, paperLabel(paper)]]
    }))
    const workspace = readProjectWorkspace(project)
    return {
      ...stored,
      paperTitles,
      paperCount: Object.keys(paperTitles).length,
      conclusions: conclusionCounts(stored.conclusionList),
      ...(workspace === undefined ? {} : { workspace }),
    }
  }

  /** Returns projects in canonical order rather than directory scan or trash-restoration order. */
  const projects = (): ProjectRecord[] => [...projectById.values()].sort(byCreated)

  /** Archives active linked ideas when a project finishes; reopening the project does not reverse this automatically. */
  const archiveIdeasForProject = (projectId: string): void => {
    const day = today()
    let changed = false
    ideas = ideas.map((idea) => {
      if (idea.project !== projectId || idea.archived) return idea
      changed = true
      return { ...idea, archived: true, updated: day }
    })
    if (changed) save('ideas', ideas)
  }

  /** Refreshes the App-owned workspace projection without making project edits depend on transport health. */
  const syncProjectWorkspace = (project: ProjectRecord): void => {
    if (project.workspaceRoot === undefined && project.workspaceSsh === undefined) return
    try {
      writeProjectWorkspaceState(project, ideas)
    } catch (error) {
      console.warn(`项目工作区同步失败:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Takes ideas coding agents recorded in bound local workspaces into the idea list, each once and
   * linked to its project; ideas of a finished project arrive archived.
   */
  const absorbAgentIdeas = (): void => {
    const taken = new Set(state.agentIdeas ?? [])
    const added: ResearchIdea[] = []
    const touched: ProjectRecord[] = []
    for (const project of projects()) {
      const fresh = readWorkspaceAgentIdeas(project.workspaceRoot).filter((found) => !taken.has(`${project.id}:${found.id}`))
      for (const found of fresh) {
        taken.add(`${project.id}:${found.id}`)
        const idea = createResearchIdea(nextId('idea'), found.title, found.body, {
          chatTitle: found.context ?? project.name, agent: true,
        }, found.date)
        added.push({
          ...idea, project: project.id, archived: project.status === FINISHED_PROJECT,
          ...(found.node === undefined ? {} : { node: found.node }),
        })
      }
      if (fresh.length > 0) touched.push(project)
    }
    if (added.length === 0) return
    ideas = [...added, ...ideas]
    save('ideas', ideas)
    state = { ...state, agentIdeas: [...taken] }
    writeJson(stateFile, state, staging)
    for (const project of touched) syncProjectWorkspace(project)
  }

  /** Current paper rows augmented with links and conclusions stored on projects. */
  const linkedRows = (): PaperRow[] => {
    const held = projects()
    return [...papers.values()].map((row) => withProjectLinks(row, held))
  }

  /** Writes only the modified project fields to its page and returns the updated detail. */
  const writeProject = (
    project: ProjectRecord, fields: (keyof ProjectRecord)[], syncWorkspace = true,
  ): ProjectDetail => {
    projectById.set(project.id, project)
    writeProjectFields(projectFile(project.id), project, fields, staging)
    if (project.status === FINISHED_PROJECT) archiveIdeasForProject(project.id)
    if (syncWorkspace) syncProjectWorkspace(project)
    return detailOf(project)
  }

  /** Returns a live inbox entry. Throws when the ID is absent or already removed. */
  const liveEntry = (id: string): InboxRecord => {
    const entry = inbox.find((e) => e.id === id && !e.gone)
    if (!entry) throw new Error(`收件里没有这一条:${id}`)
    return entry
  }

  /** Applies a patch to an inbox entry and persists the list. */
  const putEntry = (id: string, patch: Partial<InboxRecord>): void => {
    inbox = inbox.map((e) => (e.id === id ? { ...e, ...patch } : e))
    save('inbox', inbox)
  }

  /** Returns a chat by ID. Throws when the vault has no such chat. */
  const chatOf = (id: string): ChatRecord => {
    const chat = chats.find((c) => c.id === id)
    if (!chat) throw new Error(`会话不存在:${id}`)
    return chat
  }

  const chatSession = ({ id, title, archived, messages, paperId }: ChatRecord): ChatSession => ({
    id, title, archived, messageCount: messages.length,
    ...(paperId === undefined ? {} : { paperId }),
  })

  /** Appends a dated project research-log entry, optionally linked to a research-graph node. */
  const appendEvent = (projectId: string, text: string, node?: string): ProjectDetail => {
    const project = projectOf(projectId)
    checkOneLine(text)
    if (node !== undefined && !project.graph.nodes.some((item) => item.id === node)) {
      throw new Error(`节点不存在:${node}`)
    }
    return writeProject(
      {
        ...project,
        events: [...project.events, { date: today(), text, ...(node === undefined ? {} : { node }) }],
      },
      ['events'],
    )
  }

  /** Permanently removes a page held by a trash record; record kinds without pages need no file removal. */
  const discard = (item: TrashRecord): void => {
    if (item.kind === 'paper' || item.kind === 'project') removePage(trashPage(item.id))
  }

  /** Permanently removes expired trash records and their stored content. */
  const dropExpired = (): void => {
    const cutoff = nowMs() - TRASH_RETENTION_DAYS * 86_400_000
    const expired = trash.filter((item) => item.deletedAt <= cutoff)
    if (expired.length === 0) return
    for (const item of expired) discard(item)
    trash = trash.filter((item) => item.deletedAt > cutoff)
    save('trash', trash)
  }

  /** Adds a record to trash with the most recently deleted item first. */
  const toTrash = (item: TrashRecord): void => {
    trash = [item, ...trash]
    save('trash', trash)
  }

  const managed = isGitManaged(root)
  /** Records a vault-level feed event, including diagnostics emitted while opening the vault. */
  const note = (runs: FeedRun[]): void => {
    const day = today()
    feed = [...feed, {
      id: nextId('feed'), source: 'steward', day: dayOf(day, day), time: FEED_NOW,
      createdAt: now().toISOString(),
      body: { kind: 'runs', runs },
    }]
    save('feed', feed)
  }

  console.info(`vault ${root}:${managed ? '' : '不'}在 git 管理之下`)
  if (state.gitManaged !== managed) {
    note([
      { kind: 'text', text: '这个库' },
      { kind: 'strong', text: managed ? '在 git 管理之下' : '不在 git 管理之下' },
      {
        kind: 'text',
        text: managed
          ? ',写入都能靠版本历史撤回。'
          : ',写入没有撤销的安全网——把它交给 git 之后再动它。',
      },
    ])
    state = { ...state, gitManaged: managed }
    writeJson(stateFile, state, staging)
  }

  // Multiple pages may legally reference one source, usually after duplicate imports. Keep every page visible and
  // report the condition so the user can decide whether to merge them or keep them separate.
  const shared = [...pagesOf].filter(([, stems]) => stems.length > 1)
  if (state.sharedSources !== shared.length) {
    if (shared.length > 0) {
      note([
        { kind: 'text', text: '库里有 ' },
        { kind: 'strong', text: `${shared.length} 份原文各被不止一页记着` },
        {
          kind: 'text',
          text: `:${shared.map(([source, stems]) => `${source} → ${stems.join('、')}`).join(';')}。`
            + '这几页都列得出、改得动、删得掉,但它们指着同一份 PDF。',
        },
      ])
    }
    state = { ...state, sharedSources: shared.length }
    writeJson(stateFile, state, staging)
  }

  /** Returns the current vault column configuration, or an empty configuration before customization. */
  const heldColumns = (): PaperColumns => liveColumns(state.columns ?? emptyColumns())

  /** Stores immutable PDF bytes and creates an unfiled paper page when the source is new. */
  const storeUpload = (filename: string, bytes: Uint8Array): PaperImportResult => {
    const upload = parsePaperUpload(filename, bytes)
    const sourceDir = join(root, 'sources', 'papers')
    const heldSource = existsSync(sourceDir)
      ? readdirSync(sourceDir).find((name) => name.startsWith(`${upload.sourceId}-`) && name.endsWith('.pdf'))
      : undefined
    if (heldSource !== undefined
      && !readFileSync(join(sourceDir, heldSource)).equals(Buffer.from(upload.bytes))) {
      throw new Error(`原文内容散列前缀冲突:${upload.sourceId}`)
    }
    if (heldSource === undefined) writeImmutable(join(sourceDir, upload.sourceFilename), upload.bytes, staging)
    const existing = pagesOf.get(upload.sourceId)?.[0]
    if (existing) return paperImportResult('existing', papers.get(existing)!)
    const stem = freePageStem(upload.title, upload.sourceId, (name) => existsSync(paperFile(name)))
    const file = paperFile(stem)
    writePage(file, newPaperPageText(
      upload.sourceId, upload.title, UNREAD_PAPER, today(), now().toISOString(),
    ), staging)
    refreshWikiPage(stem, file)
    indexPaper(readPage(file))
    return paperImportResult('added', papers.get(stem)!)
  }

  /** Fills only missing bibliographic fields and updates queued copies of the same source. */
  const fillPaper = (id: string, fill: MetadataFill, replaceTitle: string | null): string[] => {
    const paper = papers.get(id)
    if (!paper) throw new Error(`论文不存在:${id}`)
    const write = missingMetadata(paper, fill, replaceTitle)
    const written = Object.keys(write)
    if (written.length === 0) return []
    writePaper(id, { ...write, updated: today() })
    const filled = papers.get(id)!
    const source = sourceOf(id)
    later = later.map((entry) => (entry.paper === source
      ? laterWithMetadata(entry, filled, write.title !== undefined)
      : entry))
    save('later', later)
    return written
  }

  /** Returns an inbox record even after it has left the visible inbox. */
  const downloadableEntry = (id: string): InboxRecord => {
    const entry = inbox.find((held) => held.id === id)
    if (!entry) throw new Error(`收件里没有这一条:${id}`)
    if (entry.downloaded) throw new Error(`这一条已经入库:${id}`)
    return entry
  }

  const arxivSeed = (paper: PaperRow | undefined): string | null => {
    if (paper === undefined) return null
    const named = paper.identifier?.match(/^arXiv:(.+)$/i)?.[1]?.replace(/v\d+$/, '')
    if (named) return named
    return /^\d{4}\.\d{4,5}(?:v\d+)?$/.test(paper.id) ? paper.id.replace(/v\d+$/, '') : null
  }

  const projectDiscoveryProfile = (projectId: string) => {
    const project = projectOf(projectId)
    const discovered = inbox.filter((entry) => entry.kind === 'discovery' && entry.project === projectId)
    const linkedPapers = project.papers.flatMap((id) => {
      const paper = papers.get(id)
      return paper === undefined ? [] : [paper]
    })
    const wikiTerms = [...new Set(linkedPapers.flatMap((paper) => [
      ...paper.topics, ...paper.methods,
    ]))]
    return buildRecommendationProfile({
      projectId: project.id,
      projectName: project.name,
      anchorText: [
        project.name, project.topic, project.focus,
        ...(project.graph.activePath ?? []).flatMap((id) => {
          const node = project.graph.nodes.find((held) => held.id === id)
          return node === undefined ? [] : [node.label, node.nextAction ?? '']
        }),
      ].filter(Boolean).join(' · '),
      wikiTerms,
      projectPapers: linkedPapers.flatMap((paper) => {
        const seed = arxivSeed(paper)
        return seed === null ? [] : [{
          paperId: `ARXIV:${seed}`, title: paper.title, abstract: paper.abstract ?? '',
          wikiTerms: [...paper.topics, ...paper.methods],
        }]
      }),
      feedbackPapers: discovered.flatMap((entry) => (
        entry.feedback === undefined || entry.semanticId === '' ? [] : [{
          paperId: entry.semanticId, title: entry.title, abstract: entry.abstract,
          feedback: entry.feedback,
        }]
      )),
    })
  }
  const projectDiscoverySeeds = (projectId: string) => (
    recommendationSeedIds(projectDiscoveryProfile(projectId))
  )
  const discoveryPreferences = (projectId: string): DiscoveryPreferences => (
    state.discoveryPreferences?.[projectId] ?? { coreIntentId: null, disabledIntentIds: [] }
  )
  const projectDiscoveryIntents = (projectId: string) => applyRecommendationPreferences(
    clusterRecommendationProfile(projectDiscoveryProfile(projectId)),
    discoveryPreferences(projectId),
  )

  const ops: VaultOps = {
    today,

    listPapers(params) {
      if (params.facet) checkGroupKey(params.facet.field, heldColumns())
      const { rows, total } = listPapers(linkedRows(), params)
      return { rows: rows.map((row) => structuredClone(row)), total }
    },

    facetPapers(field, filter) {
      checkGroupKey(field, heldColumns())
      return facetPapers(linkedRows(), field, filter)
    },

    getPaper(id) {
      const paper = papers.get(id)
      if (!paper) throw new Error(`论文不存在:${id}`)
      return structuredClone(withProjectLinks(paper, projects()))
    },

    updatePaper(id, patch) {
      const paper = papers.get(id)
      if (!paper) throw new Error(`论文不存在:${id}`)
      if (patch.topics !== undefined) throw new Error('这一页的主题由归属决定,改归属')
      const { custom, ...fields } = patch
      if (custom !== undefined) checkCustom(heldColumns(), custom, paper.custom)
      writePaper(id, {
        ...fields,
        ...(custom === undefined ? {} : { custom: patchedCustom(paper.custom, custom) }),
        updated: today(),
      })
      if (patch.title !== undefined || patch.shortTitle !== undefined) {
        const fresh = papers.get(id)!
        chats = chats.map((session) => (session.paperId === id
          ? { ...session, title: fresh.shortTitle || fresh.title }
          : session))
        save('chats', chats)
      }
    },

    paperSnapshot(id) {
      if (!papers.has(id)) throw new Error(`论文不存在:${id}`)
      return snapshotOf(readPage(paperFile(id)).front)
    },

    putPaper(id, snapshot) {
      if (!papers.has(id)) throw new Error(`论文不存在:${id}`)
      const held = snapshotOf(readPage(paperFile(id)).front)
      // Skip values already present on the page: real-vault writes replace lines, so rewriting an unchanged value would reorder its block.
      writePaper(id, {
        ...(snapshot.title === undefined || held.title === snapshot.title ? {} : { title: snapshot.title }),
        ...(held.shortTitle === snapshot.shortTitle ? {} : { shortTitle: snapshot.shortTitle ?? null }),
        ...(JSON.stringify(held.authors) === JSON.stringify(snapshot.authors)
          ? {} : { authors: snapshot.authors ?? null }),
        ...(held.year === snapshot.year ? {} : { year: snapshot.year ?? null }),
        ...(snapshot.venue === undefined || held.venue === snapshot.venue ? {} : { venue: snapshot.venue }),
        ...(held.rating === snapshot.rating ? {} : { rating: snapshot.rating ?? null }),
        ...(held.identifier === snapshot.identifier
          ? {} : { identifier: snapshot.identifier ?? null }),
        ...(held.submitted === snapshot.submitted ? {} : { submitted: snapshot.submitted ?? null }),
        ...(JSON.stringify(held.topics) === JSON.stringify(snapshot.topics)
          ? {} : { topics: snapshot.topics }),
        ...(held.readState === snapshot.readState ? {} : { readState: snapshot.readState ?? null }),
        ...(held.updated === snapshot.updated ? {} : { updated: snapshot.updated }),
        ...(JSON.stringify(held.custom) === JSON.stringify(snapshot.custom)
          ? {} : { custom: snapshot.custom }),
      })
      const restored = papers.get(id)!
      chats = chats.map((session) => (session.paperId === id
        ? { ...session, title: restored.shortTitle || restored.title }
        : session))
      save('chats', chats)
    },

    deletePaper(id) {
      const paper = papers.get(id)
      if (!paper) throw new Error(`论文不存在:${id}`)
      const entry = nextId('trash')
      const source = sourceOf(id)
      const reading = readings.find((held) => held.paperId === id)
      // Sources are immutable: remove only the wiki page and leave the PDF under sources for restoration.
      movePage(paperFile(id), trashPage(entry))
      unindexPaper(id, source)
      refreshWikiPage(id, null)
      if (reading !== undefined) {
        readings = readings.filter((held) => held !== reading)
        save('paper-readings', readings)
      }
      toTrash({
        id: entry, kind: 'paper', title: paper.title, deletedAt: nowMs(),
        page: `wiki/papers/${id}.md`,
        ...(reading === undefined ? {} : { reading }),
      })
    },

    paperSource(id) {
      if (!papers.has(id)) throw new Error(`论文不存在:${id}`)
      const source = sourceOf(id)
      const dir = join(root, 'sources', 'papers')
      const file = source === ''
        ? undefined
        : readdirSync(dir).find((name) => name.startsWith(`${source}-`) && name.endsWith('.pdf'))
      if (!file) throw new Error(`库里没有这一篇的原文:${id}`)
      return new Uint8Array(readFileSync(join(dir, file)))
    },

    importPaper: storeUpload,

    fillPaperMetadata: fillPaper,

    paperReading(id) {
      if (!papers.has(id)) throw new Error(`论文不存在:${id}`)
      return readingOf(id)
    },

    mutatePaperReading(id, mutation: ReadingMutation) {
      if (!papers.has(id)) throw new Error(`论文不存在:${id}`)
      const next = applyReadingMutation(readingOf(id), mutation, nextId, today())
      readings = [...readings.filter((reading) => reading.paperId !== id), next]
      save('paper-readings', readings)
      const paper = papers.get(id)!
      const row: PaperRow = {
        ...paper,
        noteCount: readingNoteCount(next),
      }
      if (next.remark === '') delete row.remark
      else row.remark = next.remark
      papers.set(id, row)
      return structuredClone(next)
    },

    paperColumns() {
      return structuredClone(heldColumns())
    },

    setPaperColumns(columns) {
      checkColumns(columns, [...papers.values()])
      state = { ...state, columns: structuredClone(columns) }
      writeJson(stateFile, state, staging)
    },

    renamePaperOption(key, from, to) {
      const held = heldColumns()
      const options = renamedOptions(held, key, from, to)
      const day = today()
      // Writing a page replaces its `papers` entry, so capture every target row before any write.
      for (const row of [...papers.values()]) {
        const cell = renamedCell(row, key, from, to)
        if (cell === undefined) continue
        writePaper(row.id, { custom: { ...row.custom, [key]: cell }, updated: day })
      }
      state = {
        ...state,
        columns: {
          ...held,
          custom: held.custom.map((c) => (c.key === key ? { ...c, options } : c)),
        },
      }
      writeJson(stateFile, state, staging)
    },

    setPaperColumnType(key, type) {
      const { columns: next, cells } = retypedColumn(heldColumns(), [...papers.values()], key, type)
      const day = today()
      // Writing a page replaces its `papers` entry, so refetch each row by ID immediately before writing it.
      for (const [id, cell] of cells) {
        writePaper(id, { custom: patchedCustom(papers.get(id)!.custom, { [key]: cell ?? null }), updated: day })
      }
      state = { ...state, columns: next }
      writeJson(stateFile, state, staging)
    },

    paperCells(key) {
      return structuredClone(columnCells([...papers.values()], key))
    },

    putPaperColumn(column, groupAt, cells) {
      const { columns: next, cells: changed } = restoredColumn(
        heldColumns(), [...papers.values()], column, groupAt, cells)
      const day = today()
      for (const [id, cell] of changed) {
        writePaper(id, {
          custom: patchedCustom(papers.get(id)!.custom, { [column.key]: cell ?? null }), updated: day,
        })
      }
      state = { ...state, columns: next }
      writeJson(stateFile, state, staging)
    },

    listProjects() {
      return applyOrder(projects(), state.projectOrder, (p) => p.id).map((p) => {
        const workspace = p.workspaceRoot === undefined ? undefined : readProjectWorkspace(p)
        const graph = workspace?.graph ?? p.graph
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          priority: p.priority,
          topic: p.topic,
          focus: p.focus,
          ...(p.block === undefined ? {} : { block: p.block }),
          ...(p.conflictPage === undefined ? {} : { conflictPage: p.conflictPage }),
          control: projectControlState({
            tasks: p.tasks,
            ...(p.block === undefined ? {} : { block: p.block }),
            activePath: overviewResearch(graph).activePath,
          }),
          conclusions: conclusionCounts(p.conclusionList),
          paperCount: p.papers.filter((id) => papers.has(id)).length,
          milestones: p.milestones.map(({ date, done }) => ({ date, done })),
          recentEvents: p.events.slice(-RECENT_EVENTS).map(({ date, text }) => ({ date, text })),
        }
      })
    },

    reorderProjects(order) {
      const known = new Set(projectById.keys())
      state = { ...state, projectOrder: [...order].filter((id) => known.has(id)) }
      writeJson(stateFile, state, staging)
    },

    overviewProjects() {
      return applyOrder(projects(), state.projectOrder, (p) => p.id).map((p) => {
        // Overview never initiates SSH; reading graph and events from a local workspace is cheap enough to match the project page.
        const workspace = p.workspaceRoot === undefined ? undefined : readProjectWorkspace(p)
        const graph = workspace?.graph ?? p.graph
        const events = [...p.events, ...(workspace?.events ?? [])]
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          priority: p.priority,
          focus: p.focus,
          ...(p.block === undefined ? {} : { block: p.block }),
          start: p.start,
          due: p.due,
          conclusions: conclusionCounts(p.conclusionList),
          tasks: p.tasks.map((task) => ({
            ...task,
            ...(task.window === undefined ? {} : { window: { ...task.window } }),
          })),
          milestones: p.milestones.map((m) => ({ ...m })),
          events: events.map((e) => ({ ...e })),
          research: overviewResearch(graph),
        }
      })
    },

    createProject(name) {
      const start = today()
      const project: ProjectRecord = {
        id: nextId('project'),
        created: start,
        name,
        status: ACTIVE_PROJECT,
        priority: 'p1',
        topic: '未分主题',
        focus: '定义第一步',
        start,
        due: new Date(Date.parse(`${start}T00:00:00Z`) + NEW_PROJECT_SPAN_DAYS * 86_400_000)
          .toISOString().slice(0, 10),
        memo: '',
        conclusionList: [],
        papers: [],
        tasks: [],
        milestones: [],
        events: [{ date: start, text: '创建项目' }],
        relations: [],
        attachments: [],
        graph: { nodes: [], edges: [] },
        agentSessions: [],
      }
      projectById.set(project.id, project)
      writePage(projectFile(project.id), projectPageText(project), staging)
    },

    putProject(project) {
      const fields = Object.fromEntries(PROJECT_FIELDS.map((key) => [key, project[key]]))
      writeProject({ ...projectOf(project.id), ...fields }, PROJECT_FIELDS)
    },

    getProject(id) {
      const project = projectOf(id)
      const nodeIds = new Set(project.graph.nodes.map((n) => n.id))
      for (const [from, to] of project.graph.edges) {
        if (!nodeIds.has(from) || !nodeIds.has(to)) {
          throw new Error(`科研图的边指向不存在的节点:${from} → ${to}`)
        }
      }
      return detailOf(project)
    },

    bindProjectWorkspace(id, binding: ProjectWorkspaceBinding | null) {
      const project = projectOf(id)
      if (binding === null) {
        const next = { ...project }
        delete next.workspaceRoot
        delete next.workspaceSsh
        return writeProject(next, ['workspaceRoot', 'workspaceSsh'])
      }
      const next = { ...project }
      if (binding.kind === 'local') {
        next.workspaceRoot = projectWorkspaceRoot(binding.root)
        delete next.workspaceSsh
      } else {
        const remote = projectWorkspaceSsh(binding)
        next.workspaceSsh = {
          host: remote.host, path: remote.path,
          ...(remote.port === undefined ? {} : { port: remote.port }),
        }
        delete next.workspaceRoot
      }
      // The first connection must complete the protocol; do not persist a broken connection on failure.
      writeProjectWorkspaceState(next, ideas)
      return writeProject(next, ['workspaceRoot', 'workspaceSsh'], false)
    },

    updateProject(id, patch) {
      const { block, ...fields } = patch
      const next: ProjectRecord = { ...projectOf(id), ...fields }
      if (block === null) delete next.block
      if (typeof block === 'string') next.block = block
      // The contract guarantees fixed-width ISO dates, so lexical order is chronological order.
      if (next.due < next.start) throw new Error(`项目截止日期早于开始日期:${next.start} – ${next.due}`)
      return writeProject(next, Object.keys(patch) as (keyof ProjectRecord)[])
    },

    deleteProject(id) {
      const project = projectOf(id)
      const entry = nextId('trash')
      movePage(projectFile(id), trashPage(entry))
      projectById.delete(id)
      const removedEntries = new Set(
        inbox.filter((held) => held.kind === 'discovery' && held.project === id)
          .map((held) => held.id),
      )
      if (removedEntries.size > 0) {
        inbox = inbox.filter((held) => !removedEntries.has(held.id))
        trash = trash.filter((item) => item.kind !== 'inbox' || !removedEntries.has(item.entryId))
        save('inbox', inbox)
        save('trash', trash)
      }
      toTrash({
        id: entry, kind: 'project', title: project.name, deletedAt: nowMs(),
        page: `wiki/${PROJECTS_DIR}/${id}.md`,
      })
    },

    createTask(projectId, task) {
      const project = projectOf(projectId)
      checkSpan(task)
      return writeProject({ ...project, tasks: [...project.tasks, { ...task, id: nextId('task') }] }, ['tasks'])
    },

    updateTask(projectId, taskId, patch) {
      const project = projectOf(projectId)
      const task = project.tasks.find((t) => t.id === taskId)
      if (!task) throw new Error(`任务不存在:${taskId}`)
      const { window, ...fields } = patch
      // Core has removed undefined patch keys; this assertion preserves the exact required type after merging.
      const next = { ...task, ...fields } as Task
      if (window === null) delete next.window
      else if (window !== undefined) next.window = window
      checkSpan(next)
      return writeProject(
        { ...project, tasks: project.tasks.map((t) => (t.id === taskId ? next : t)) }, ['tasks'],
      )
    },

    deleteTask(projectId, taskId) {
      const project = projectOf(projectId)
      if (!project.tasks.some((t) => t.id === taskId)) throw new Error(`任务不存在:${taskId}`)
      return writeProject(
        { ...project, tasks: project.tasks.filter((t) => t.id !== taskId) }, ['tasks'],
      )
    },

    createMilestone(projectId, milestone) {
      const project = projectOf(projectId)
      return writeProject(
        { ...project, milestones: [...project.milestones, { ...milestone, id: nextId('ms') }] },
        ['milestones'],
      )
    },

    updateMilestone(projectId, milestoneId, patch) {
      const project = projectOf(projectId)
      const milestone = project.milestones.find((m) => m.id === milestoneId)
      if (!milestone) throw new Error(`里程碑不存在:${milestoneId}`)
      const next = { ...milestone, ...patch }
      return writeProject({
        ...project,
        milestones: project.milestones.map((m) => (m.id === milestoneId ? next : m)),
      }, ['milestones'])
    },

    deleteMilestone(projectId, milestoneId) {
      const project = projectOf(projectId)
      if (!project.milestones.some((m) => m.id === milestoneId)) {
        throw new Error(`里程碑不存在:${milestoneId}`)
      }
      return writeProject({
        ...project,
        milestones: project.milestones.filter((m) => m.id !== milestoneId),
      }, ['milestones'])
    },

    createRelation(projectId, { group, text, page, url }) {
      const project = projectOf(projectId)
      if (page !== undefined) {
        const target = wikiData.pages[page]
        if (target === undefined || isPaper(target)) throw new Error(`wiki 聚合不存在:${page}`)
      }
      if (page !== undefined && url !== undefined) throw new Error('关联不能同时指向 Wiki 页和链接')
      const item = {
        id: nextId('rel'), text,
        ...(page === undefined ? {} : { page }),
        ...(url === undefined ? {} : { url }),
      }
      const seen = project.relations.some((r) => r.group === group)
      return writeProject({
        ...project,
        relations: seen
          ? project.relations.map((r) => (r.group === group ? { ...r, items: [...r.items, item] } : r))
          : [...project.relations, { group, items: [item] }],
      }, ['relations'])
    },

    deleteRelation(projectId, relationId) {
      const project = projectOf(projectId)
      if (!project.relations.some((r) => r.items.some((i) => i.id === relationId))) {
        throw new Error(`关联不存在:${relationId}`)
      }
      return writeProject({
        ...project,
        relations: project.relations.map((r) =>
          ({ ...r, items: r.items.filter((i) => i.id !== relationId) })),
      }, ['relations'])
    },

    addPaper(projectId, paperId) {
      const project = projectOf(projectId)
      if (!papers.has(paperId)) throw new Error(`论文不存在:${paperId}`)
      if (project.papers.includes(paperId)) throw new Error(`已经关联过这篇论文:${paperId}`)
      return writeProject({ ...project, papers: [...project.papers, paperId] }, ['papers'])
    },

    removePaper(projectId, paperId) {
      const project = projectOf(projectId)
      if (!project.papers.includes(paperId)) throw new Error(`项目没有关联这篇论文:${paperId}`)
      return writeProject({
        ...project, papers: project.papers.filter((id) => id !== paperId),
      }, ['papers'])
    },


    moveRelation(projectId, id, index) {
      const project = projectOf(projectId)
      const moved = <T,>(list: T[], at: number): T[] => {
        const target = Math.max(0, Math.min(index, list.length - 1))
        const item = list[at]!
        const rest = list.filter((_, i) => i !== at)
        return [...rest.slice(0, target), item, ...rest.slice(target)]
      }
      const paperAt = project.papers.indexOf(id)
      if (paperAt >= 0) return writeProject({ ...project, papers: moved(project.papers, paperAt) }, ['papers'])
      const group = project.relations.find((r) => r.items.some((i) => i.id === id))
      if (group === undefined) throw new Error(`关联不存在:${id}`)
      const relations = project.relations.map((r) => (r !== group
        ? r
        : { ...r, items: moved(r.items, r.items.findIndex((i) => i.id === id)) }))
      return writeProject({ ...project, relations }, ['relations'])
    },

    createAttachment(projectId, attachment) {
      if (!isAbsolute(attachment.path)) throw new Error(`附件路径不是绝对路径:${attachment.path}`)
      const project = projectOf(projectId)
      return writeProject({
        ...project,
        attachments: [...project.attachments, { ...attachment, id: nextId('att') }],
      }, ['attachments'])
    },

    deleteAttachment(projectId, attachmentId) {
      const project = projectOf(projectId)
      const attachment = project.attachments.find((a) => a.id === attachmentId)
      if (!attachment) throw new Error(`附件不存在:${attachmentId}`)
      const next = writeProject({
        ...project,
        attachments: project.attachments.filter((a) => a.id !== attachmentId),
      }, ['attachments'])
      toTrash({
        id: nextId('trash'), kind: 'attachment', title: attachment.name, deletedAt: nowMs(),
        projectId, attachment,
      })
      return next
    },

    createEvent(projectId, text, node) {
      return appendEvent(projectId, text, node)
    },

    createNode(projectId, label, after) {
      const project = projectOf(projectId)
      const node: GraphNode = {
        id: nextId('node'), label, state: 'idle',
        ...placeNode(project.graph, label, after), writebacks: [],
      }
      return writeProject({
        ...project,
        graph: {
          nodes: [...project.graph.nodes, node],
          edges: after === null
            ? project.graph.edges
            : [...project.graph.edges, [after, node.id]],
        },
      }, ['graph'])
    },

    updateNode(projectId, nodeId, patch) {
      const project = projectOf(projectId)
      if (!project.graph.nodes.some((node) => node.id === nodeId)) {
        throw new Error(`节点不存在:${nodeId}`)
      }
      return writeProject({
        ...project,
        graph: {
          ...project.graph,
          nodes: project.graph.nodes.map((node) => (
            node.id === nodeId ? { ...node, ...patch } : node
          )),
        },
      }, ['graph'])
    },

    deleteNode(projectId, nodeId) {
      const project = projectOf(projectId)
      if (!project.graph.nodes.some((node) => node.id === nodeId)) {
        throw new Error(`节点不存在:${nodeId}`)
      }
      const nextProject = writeProject({
        ...project,
        graph: {
          nodes: project.graph.nodes.filter((node) => node.id !== nodeId),
          edges: project.graph.edges.filter(([from, to]) => from !== nodeId && to !== nodeId),
        },
      }, ['graph'])
      const day = today()
      ideas = ideas.map((idea) => (
        idea.project === projectId && idea.node === nodeId
          ? updateResearchIdea(idea, { node: null }, day)
          : idea
      ))
      save('ideas', ideas)
      const updatedProject = projectById.get(projectId)
      if (updatedProject !== undefined) syncProjectWorkspace(updatedProject)
      return nextProject
    },

    writeBack(id, node, page, text) {
      const project = projectOf(id)
      const data = wikiData
      const target = data.pages[page]
      if (target === undefined || isPaper(target)) throw new Error(`wiki 聚合不存在:${page}`)
      if (!project.graph.nodes.some((n) => n.id === node)) throw new Error(`节点不存在:${node}`)
      if (text.trim() === '') throw new Error('写回的那句话不能为空')
      checkOneLine(text)
      const day = today()
      const section = data.sections[0]!.label
      // Write the project page first so a failed write cannot leave an unattributed append on the wiki page.
      const detail = writeProject({
        ...project,
        graph: {
          ...project.graph,
          nodes: project.graph.nodes.map((n) => (n.id === node
            ? { ...n, writebacks: [...n.writebacks, { page, text, date: day }] }
            : n)),
        },
      }, ['graph'])
      appendEntry(wikiFile(page), section, entryLine(day, text), staging)
      setUpdated(wikiFile(page), day, staging)
      rereadWiki([page])
      return detail
    },

    createConclusion(projectId, text, { chat, paper }) {
      const project = projectOf(projectId)
      const source = chat === undefined ? MANUAL_SOURCE : chatSource(chatOf(chat).title)
      if (paper !== undefined && !papers.has(paper)) throw new Error(`论文不存在:${paper}`)
      const item: Conclusion = {
        id: nextId('concl'),
        text,
        state: 'pending',
        date: today(),
        source,
        ...(paper === undefined ? {} : { paper }),
      }
      return writeProject(
        { ...project, conclusionList: [...project.conclusionList, item] }, ['conclusionList'],
      )
    },

    setConclusionState(projectId, conclusionId, state) {
      const project = projectOf(projectId)
      if (!project.conclusionList.some((conclusion) => conclusion.id === conclusionId)) {
        throw new Error(`结论不存在:${conclusionId}`)
      }
      return writeProject({
        ...project,
        conclusionList: project.conclusionList.map((conclusion) => (
          conclusion.id === conclusionId ? { ...conclusion, state } : conclusion
        )),
      }, ['conclusionList'])
    },

    deleteConclusion(projectId, conclusionId) {
      const project = projectOf(projectId)
      if (!project.conclusionList.some((conclusion) => conclusion.id === conclusionId)) {
        throw new Error(`结论不存在:${conclusionId}`)
      }
      return writeProject({
        ...project,
        conclusionList: project.conclusionList.filter((conclusion) => conclusion.id !== conclusionId),
      }, ['conclusionList'])
    },

    listInbox(params = {}) {
      const rows = inbox.filter((e) => !e.gone)
        .filter((e) => params.kind === undefined || e.kind === params.kind)
        .filter((e) => params.project === undefined || e.project === params.project)
        .map((e) => ({
        id: e.id,
        kind: e.kind,
        watch: e.watch,
        project: e.project,
        source: e.source,
        title: e.title,
        authors: e.authors,
        venue: e.venue,
        abstract: e.abstract,
        rec: e.rec,
        reasons: structuredClone(e.reasons),
        ...(e.feedback === undefined ? {} : { feedback: e.feedback }),
        downloaded: e.downloaded,
        paper: paperOf(e.paper),
        pdf: e.pdf,
        ...(e.ranking === undefined ? {} : { ranking: structuredClone(e.ranking) }),
      }))
      return orderInbox(rows, params.sort)
    },

    dismissInbox(id) {
      const entry = liveEntry(id)
      putEntry(id, { gone: true })
      toTrash({
        id: nextId('trash'), kind: 'inbox', title: entry.title, deletedAt: nowMs(), entryId: id,
      })
    },

    readLater(id) {
      const entry = liveEntry(id)
      putEntry(id, { gone: true })
      if (later.some((x) => x.id === id)) return false
      later = [{
        id: entry.id,
        title: entry.title,
        source: entry.source,
        added: today(),
        authors: entry.authors,
        venue: entry.venue,
        abstract: entry.abstract,
        paper: entry.paper,
        pdf: entry.pdf,
      }, ...later]
      save('later', later)
      return true
    },

    prepareInboxDownload(id) {
      const entry = downloadableEntry(id)
      const known = pagesOf.get(entry.paper)?.[0]
        ?? [...papers.values()].find((paper) => paper.identifier === `arXiv:${entry.arxiv}`)?.id
      if (known !== undefined) return { kind: 'existing', paper: known, title: papers.get(known)!.title }
      if (entry.pdf === '') throw new Error('这一条没有原文地址')
      return { kind: 'fetch', url: entry.pdf }
    },

    completeInboxDownload(id, bytes) {
      const entry = downloadableEntry(id)
      const topics = entry.topic === '' ? null : topicDir(wikiHome(wikiData))
      const result = storeUpload(`${entry.title}.pdf`, bytes)
      if (result.kind === 'existing') {
        return { kind: 'existing', paper: result.paper.id, title: result.paper.title }
      }
      const source = sourceOf(result.paper.id)
      putEntry(id, { downloaded: true, paper: source })
      later = later.map((queued) => (queued.id === id ? { ...queued, paper: source } : queued))
      save('later', later)
      fillPaper(result.paper.id, remoteMetadata({
        id: entry.arxiv,
        title: entry.title,
        abstract: entry.abstract,
        ...entry.meta,
      }), null)
      const filing = topics === null ? null : topicProposal(
        result.paper.id,
        result.paper.shortTitle ?? entry.title,
        [],
        [entry.topic],
        wikiCards(wikiData),
        topics,
      )
      if (filing !== null) ops.applyProposal(filing)
      return { kind: 'added', paper: result.paper.id }
    },

    listLater() {
      const day = today()
      // The contract guarantees fixed-width ISO dates; stable sorting preserves insertion order within one day.
      return [...later].sort((a, b) => b.added.localeCompare(a.added))
        .map((e) => ({
          ...structuredClone(e),
          day: dayOf(e.added, day),
          paper: paperOf(e.paper),
          downloaded: pagesOf.has(e.paper),
        }))
    },

    removeLater(id) {
      if (!later.some((x) => x.id === id)) throw new Error(`稍后阅读里没有这一条:${id}`)
      later = later.filter((x) => x.id !== id)
      save('later', later)
    },

    listWatches() {
      return watches.map((w) => structuredClone(w))
    },

    createWatch(watch) {
      watches = [...watches, { id: nextId('watch'), ...structuredClone(watch), active: true }]
      save('watches', watches)
    },

    updateWatch(id, watch) {
      const current = watches.find((item) => item.id === id)
      if (current === undefined) throw new Error(`关注不存在:${id}`)
      if (current.type !== watch.type) throw new Error('不能把主题关注改成作者关注，或把作者关注改成主题关注')
      watches = watches.map((item) => (
        item.id === id ? { id, ...structuredClone(watch), active: item.active } as typeof item : item
      ))
      save('watches', watches)
    },

    setWatchActive(id, active) {
      if (!watches.some((w) => w.id === id)) throw new Error(`关注不存在:${id}`)
      watches = watches.map((w) => (w.id === id ? { ...w, active } : w))
      save('watches', watches)
    },

    deleteWatch(id) {
      if (!watches.some((w) => w.id === id)) throw new Error(`关注不存在:${id}`)
      const removedEntries = new Set(
        inbox.filter((entry) => entry.kind === 'watch' && entry.watch === id).map((entry) => entry.id),
      )
      watches = watches.filter((w) => w.id !== id)
      inbox = inbox.filter((entry) => entry.kind !== 'watch' || entry.watch !== id)
      trash = trash.filter((item) => item.kind !== 'inbox' || !removedEntries.has(item.entryId))
      save('watches', watches)
      save('inbox', inbox)
      save('trash', trash)
    },

    deliverySettings() {
      return structuredClone(state.deliverySettings ?? DEFAULT_DELIVERY_SETTINGS)
    },

    setDeliverySettings(settings: DeliverySettings) {
      state = { ...state, deliverySettings: structuredClone(settings) }
      writeJson(stateFile, state, staging)
    },

    addInboxEntries(watchId, found, limit) {
      const watch = watches.find((w) => w.id === watchId)
      if (!watch) throw new Error(`关注不存在:${watchId}`)
      const unseen = unseenPapers(
        found, inbox.filter((entry) => entry.kind === 'watch').map((entry) => entry.arxiv), papers.values(),
      )
      const added: InboxRecord[] = (limit === undefined ? unseen : unseen.slice(0, limit)).map((paper) => ({
          id: nextId('inbox'), watch: watch.id, downloaded: false, paper: '', gone: false,
          semanticId: '',
          ...inboxFields(watch, paper),
        }))
      if (added.length === 0) return []
      const at = inbox.findIndex((entry) => entry.watch === watch.id)
      inbox = at < 0 ? [...inbox, ...added] : [...inbox.slice(0, at), ...added, ...inbox.slice(at)]
      save('inbox', inbox)
      return added.map((entry) => entry.arxiv)
    },

    updateInboxEntries(watchId, found) {
      const byArxiv = new Map(found.map((paper) => [paper.id, paper]))
      let updated = 0
      inbox = inbox.map((entry) => {
        if (entry.watch !== watchId) return entry
        const paper = byArxiv.get(entry.arxiv)
        if (paper?.ranking === undefined) return entry
        const venue = paper.journalRef ?? `arXiv:${paper.id}`
        const held = entry.ranking
        if (entry.venue === venue && held !== undefined
          && held.relevance === paper.ranking.relevance && held.published === paper.ranking.published
          && held.citationCount === paper.ranking.citationCount
          && held.influentialCitationCount === paper.ranking.influentialCitationCount
          && held.submitted === paper.ranking.submitted) return entry
        updated += 1
        return {
          ...entry, venue, ranking: paper.ranking,
          meta: { ...entry.meta, journalRef: paper.journalRef },
        }
      })
      if (updated > 0) save('inbox', inbox)
      return updated
    },

    listDiscoveryProfiles() {
      return [...projectById.values()].filter((project) => project.status === ACTIVE_PROJECT)
        .map((project) => {
          const profile = projectDiscoveryProfile(project.id)
          const seeds = recommendationSeedIds(profile)
          const base = project.papers.filter((id) => arxivSeed(papers.get(id)) !== null).length
          const intents = projectDiscoveryIntents(project.id)
          return {
            id: project.id,
            name: project.name,
            seedCount: base,
            positiveCount: Math.max(0, seeds.positive.length - base),
            negativeCount: seeds.negative.length,
            intentCount: intents.filter((intent) => intent.enabled).length,
            lastFetchedAt: state.discoverySchedules?.[project.id]?.lastFetchedAt ?? null,
            intents: intents.map((intent) => ({
              id: intent.id, label: intent.label, core: intent.core, enabled: intent.enabled,
              seedCount: intent.seeds.length,
              seeds: intent.seeds.map((seed) => ({ id: seed.paperId, title: seed.title })),
            })),
          }
        })
    },

    discoverySeeds: projectDiscoverySeeds,

    discoveryProfile: projectDiscoveryProfile,

    discoveryIntents: projectDiscoveryIntents,

    discoverySchedule(projectId) {
      projectOf(projectId)
      const held = state.discoverySchedules?.[projectId]
      return held === undefined
        ? { lastFetchedAt: null, cursor: 0, requests: {} }
        : { ...held, requests: held.requests ?? {} }
    },

    setDiscoverySchedule(projectId, schedule) {
      projectOf(projectId)
      state = {
        ...state,
        discoverySchedules: { ...state.discoverySchedules, [projectId]: schedule },
      }
      writeJson(stateFile, state, staging)
    },

    setDiscoveryIntent(projectId, intentId, action) {
      projectOf(projectId)
      if (!projectDiscoveryIntents(projectId).some((intent) => intent.id === intentId)) {
        throw new Error(`推荐方向不存在:${intentId}`)
      }
      const held = discoveryPreferences(projectId)
      const disabled = new Set(held.disabledIntentIds)
      if (action === 'disable') disabled.add(intentId)
      else disabled.delete(intentId)
      state = {
        ...state,
        discoveryPreferences: {
          ...state.discoveryPreferences,
          [projectId]: {
            coreIntentId: action === 'set-core' ? intentId : held.coreIntentId,
            disabledIntentIds: [...disabled],
          },
        },
      }
      writeJson(stateFile, state, staging)
    },

    addDiscoveryEntries(projectId, found: DiscoveryPaper[], limit) {
      const project = projectOf(projectId)
      const seeds = projectDiscoverySeeds(projectId)
      const seen = inbox.filter((entry) => entry.kind === 'discovery' && entry.project === projectId)
        .map((entry) => entry.arxiv)
      const unseen = unseenPapers(found, seen, papers.values())
      const added: InboxRecord[] = (limit === undefined ? unseen : unseen.slice(0, limit)).map((paper) => ({
        id: nextId('inbox'),
        kind: 'discovery',
        watch: '',
        project: project.id,
        source: `项目 · ${project.name}`,
        title: paper.title,
        authors: paper.authors.join(', '),
        venue: paper.journalRef ?? `arXiv:${paper.id}`,
        abstract: paper.abstract,
        rec: '',
        reasons: discoveryReasons(project.name, seeds.positive.length, paper),
        downloaded: false,
        paper: '',
        pdf: paper.pdf,
        ...(paper.ranking === undefined ? {} : { ranking: paper.ranking }),
        topic: '',
        gone: false,
        arxiv: paper.id,
        semanticId: paper.semanticId,
        meta: { authors: paper.authors, submitted: paper.submitted, journalRef: paper.journalRef },
      }))
      if (added.length === 0) return 0
      inbox = [...added, ...inbox]
      save('inbox', inbox)
      return added.length
    },

    feedbackDiscovery(id, feedback) {
      const entry = liveEntry(id)
      if (entry.kind !== 'discovery') throw new Error(`这一条不是论文发现:${id}`)
      putEntry(id, { feedback, gone: feedback === 'more' ? false : true })
    },

    lastFetch() {
      return state.fetchedAt ?? null
    },

    setLastFetch(at) {
      state = { ...state, fetchedAt: at }
      writeJson(stateFile, state, staging)
    },

    wikiHome() {
      return wikiHome(wikiData)
    },

    wikiAggregation(id) {
      return wikiAggregation(wikiData, id)
    },

    wikiPaper(id) {
      if (wikiData.pages[id] === undefined) throw new Error(`wiki 论文页不存在:${id}`)
      return wikiPaper(wikiData, id)
    },

    wikiCards() {
      return wikiCards(wikiData)
    },

    wikiSections() {
      return wikiData.sections.map((s) => s.label)
    },

    applyProposal(proposal) {
      const data = wikiData
      const day = today()
      // Validate the complete proposal first so an invalid step writes no bytes.
      const next = applyProposal(data, proposal, day)
      // Refill requires generated-region markers. Newly proposed pages are not on disk yet, so skip them here.
      for (const id of refilled(proposal, data, next)) {
        if (existsSync(wikiFile(id))) checkGenerated(wikiFile(id))
      }
      for (const op of proposal.ops) {
        if (op.op === 'createAggregation') {
          const kind = data.kinds[op.kind]!
          createAggregationPage(wikiFile(op.id), {
            kind: op.kind, title: op.title, parents: op.parents, columns: op.columns,
            splitOn: op.splitOn, updated: day,
          }, { section: kind.describe.section, text: op.describe }, data.sections.map((s) => s.label), staging)
        } else if (op.op === 'setMembership') {
          setMembership(wikiFile(op.paper), {
            in: op.in,
            cells: Object.fromEntries(Object.entries(op.cells)
              .map(([k, c]) => [k, { value: c.value, at: { page: c.page, quote: c.quote } }])),
          }, staging)
          setUpdated(wikiFile(op.paper), day, staging)
        } else if (op.op === 'removeMembership') {
          removeMembership(wikiFile(op.paper), op.in, staging)
          setUpdated(wikiFile(op.paper), day, staging)
        } else if (op.op === 'appendEntry') {
          appendEntry(wikiFile(op.page), op.section, entryLine(op.date, op.text), staging)
          setUpdated(wikiFile(op.page), day, staging)
        } else if (op.op === 'setParents') {
          setParents(wikiFile(op.page), op.parents, staging)
          setUpdated(wikiFile(op.page), day, staging)
        } else if (op.op === 'setAggregationMetadata') {
          setAggregationMetadata(wikiFile(op.page), { title: op.title, splitOn: op.splitOn }, staging)
          setUpdated(wikiFile(op.page), day, staging)
        } else {
          setColumns(wikiFile(op.page), op.columns, staging)
          setUpdated(wikiFile(op.page), day, staging)
        }
      }
      for (const id of refilled(proposal, data, next)) {
        fillGenerated(wikiFile(id), {
          children: generatedChildren(next, id), table: generatedTable(next, id),
        }, staging)
      }
      rereadWiki(touchedPages(proposal))
    },

    updateWikiPage(id, body) {
      checkBody(id, body)
      if (wikiData.pages[id] === undefined) throw new Error(`wiki 页不存在:${id}`)
      setBody(wikiFile(id), body, staging)
      setUpdated(wikiFile(id), today(), staging)
      rereadWiki([id])
    },

    applyPaperWikiDraft(id, body) {
      checkBody(id, body)
      if (wikiData.pages[id] === undefined) throw new Error(`wiki 页不存在:${id}`)
      setBodyAndTrust(wikiFile(id), body, staging)
      setUpdated(wikiFile(id), today(), staging)
      rereadWiki([id])
    },

    proposalPages(proposal) {
      const data = wikiData
      const next = applyProposal(data, proposal, today())
      const named = touchedPages(proposal)
      return [...named, ...refilled(proposal, data, next).filter((id) => !named.includes(id))]
    },

    readPages(paths) {
      return paths.map((path) => {
        const file = wikiFile(path)
        return { path, text: existsSync(file) ? readFileSync(file, 'utf8') : null }
      })
    },

    putPages(pages) {
      for (const { path, text } of pages) {
        const file = wikiFile(path)
        if (text === null) removePage(file)
        else replacePage(file, text, staging)
        if (!path.startsWith(PROJECT_PATH)) continue
        const id = path.slice(PROJECT_PATH.length)
        if (text === null) projectById.delete(id)
        else projectById.set(id, readProjectPage(file, id))
      }
      rereadWiki(pages.map((p) => p.path))
    },

    listTrash() {
      dropExpired()
      // Only attachments require another live owner for restoration; they cannot return after their original project is deleted.
      return trash.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        deletedAt: item.deletedAt,
        restorable: item.kind !== 'attachment' || projectById.has(item.projectId),
      }))
    },

    trashedPaper(id) {
      const item = trash.find((entry) => entry.id === id)
      return item?.kind === 'paper' ? basename(item.page, '.md') : undefined
    },

    restoreTrash(id) {
      dropExpired()
      const item = trash.find((entry) => entry.id === id)
      if (!item) throw new Error(`垃圾桶里没有这一条:${id}`)
      if (item.kind === 'paper') {
        const back = join(root, item.page)
        movePage(trashPage(id), back)
        if (item.reading !== undefined) {
          readings = [...readings, item.reading]
          save('paper-readings', readings)
        }
        const page = readPage(back)
        refreshWikiPage(page.id, back)
        indexPaper(page)
      } else if (item.kind === 'project') {
        const back = join(root, item.page)
        const projectId = basename(item.page, '.md')
        movePage(trashPage(id), back)
        const restored = readProjectPage(back, projectId)
        projectById.set(projectId, restored)
        if (restored.status === FINISHED_PROJECT) archiveIdeasForProject(projectId)
      } else if (item.kind === 'inbox') {
        putEntry(item.entryId, { gone: false })
      } else if (item.kind === 'idea') {
        ideas = [structuredClone(item.idea), ...ideas]
        save('ideas', ideas)
        if (item.idea.project !== undefined) {
          const project = projectById.get(item.idea.project)
          if (project !== undefined) syncProjectWorkspace(project)
        }
      } else {
        const project = projectById.get(item.projectId)
        if (!project) throw new Error(`项目不存在:${item.projectId}`)
        writeProject(
          { ...project, attachments: [...project.attachments, item.attachment] }, ['attachments'],
        )
      }
      trash = trash.filter((entry) => entry !== item)
      save('trash', trash)
    },

    purgeTrash(id) {
      dropExpired()
      const item = trash.find((entry) => entry.id === id)
      if (!item) throw new Error(`垃圾桶里没有这一条:${id}`)
      discard(item)
      trash = trash.filter((entry) => entry !== item)
      save('trash', trash)
    },

    clearTrash() {
      for (const item of trash) discard(item)
      trash = []
      save('trash', trash)
    },

    listFeed() {
      return feed.map((e) => structuredClone(e))
    },

    appendFeed({ source, body }) {
      const day = today()
      feed = [...feed, {
        id: nextId('entry'), source, day: dayOf(day, day), time: FEED_NOW,
        createdAt: now().toISOString(),
        body: structuredClone(body),
      }]
      save('feed', feed)
    },

    listChats() {
      return chats
        .filter((held) => held.paperId === undefined || held.messages.length > 0)
        .map(chatSession)
    },

    chatMessages(id) {
      return chatOf(id).messages.map((m) => structuredClone(m))
    },

    chatSession(id) {
      return chatSession(chatOf(id))
    },

    createChat(title, named) {
      const chat: ChatRecord = { id: nextId('chat'), title, named, archived: false, messages: [] }
      chats = [chat, ...chats]
      save('chats', chats)
      return chatSession(chat)
    },

    chatForPaper(paperId) {
      const found = chats.find((held) => held.paperId === paperId)
      if (found !== undefined) return chatSession(found)
      const paper = papers.get(paperId)
      if (paper === undefined) throw new Error(`论文不存在:${paperId}`)
      const created: ChatRecord = {
        id: nextId('chat'), title: paper.shortTitle || paper.title, named: true, archived: false, messages: [], paperId,
      }
      chats = [created, ...chats]
      save('chats', chats)
      return chatSession(created)
    },

    appendChatMessages(id, messages) {
      const chat = chatOf(id)
      const added = messages.map((m) => ({ ...structuredClone(m), id: nextId('msg') }))
      const naming = chat.named ? undefined : added.find((m) => m.role === 'you')
      const next: ChatRecord = {
        ...chat,
        ...(naming === undefined
          ? {}
          : { title: naming.runs.map((r) => r.text).join('').slice(0, CHAT_TITLE_CHARS), named: true }),
        messages: [...chat.messages, ...added],
      }
      chats = chats.map((c) => (c.id === id ? next : c))
      save('chats', chats)
    },

    listIdeas() {
      absorbAgentIdeas()
      const sorted = [...ideas]
        .sort((a, b) => b.updated.localeCompare(a.updated) || b.id.localeCompare(a.id, undefined, { numeric: true }))
      return applyOrder(sorted, state.ideaOrder, (idea) => idea.id).map((idea) => structuredClone(idea))
    },

    reorderIdeas(order) {
      const known = new Set(ideas.map((idea) => idea.id))
      state = { ...state, ideaOrder: [...order].filter((id) => known.has(id)) }
      writeJson(stateFile, state, staging)
    },

    createIdea(chatId, title, body) {
      const sourceChat = chatOf(chatId)
      const sourcePaper = sourceChat.paperId === undefined ? undefined : papers.get(sourceChat.paperId)
      const idea = createResearchIdea(nextId('idea'), title, body, {
        chatId: sourceChat.id,
        chatTitle: sourceChat.title,
        ...(sourcePaper === undefined
          ? {}
          : { paperId: sourcePaper.id, paperTitle: sourcePaper.title }),
      }, today())
      ideas = [idea, ...ideas]
      save('ideas', ideas)
      return structuredClone(idea)
    },

    updateIdea(id, patch) {
      const current = ideas.find((idea) => idea.id === id)
      if (current === undefined) throw new Error(`想法不存在:${id}`)
      const projectChanged = patch.project !== undefined && patch.project !== current.project
      const normalized = projectChanged && patch.node === undefined ? { ...patch, node: null } : patch
      const linked = normalized.project === undefined ? current.project : normalized.project ?? undefined
      if (linked !== undefined && !projectById.has(linked)) throw new Error(`项目不存在:${linked}`)
      const node = normalized.node === undefined ? current.node : normalized.node ?? undefined
      if (node !== undefined && linked === undefined) {
        throw new Error('科研图节点必须属于想法关联的项目')
      }
      const completed = linked !== undefined && projectById.get(linked)?.status === FINISHED_PROJECT
      const next = updateResearchIdea(
        current, completed ? { ...normalized, archived: true } : normalized, today(),
      )
      ideas = ideas.map((idea) => (idea.id === id ? next : idea))
      save('ideas', ideas)
      const affectedProjects = new Set([current.project, next.project])
      for (const projectId of affectedProjects) {
        if (projectId === undefined) continue
        const project = projectById.get(projectId)
        if (project !== undefined) syncProjectWorkspace(project)
      }
      return structuredClone(next)
    },

    deleteIdea(id) {
      const idea = ideas.find((held) => held.id === id)
      if (idea === undefined) throw new Error(`想法不存在:${id}`)
      ideas = ideas.filter((held) => held !== idea)
      save('ideas', ideas)
      if (idea.project !== undefined) {
        const project = projectById.get(idea.project)
        if (project !== undefined) syncProjectWorkspace(project)
      }
      toTrash({
        id: nextId('trash'), kind: 'idea', title: idea.title, deletedAt: nowMs(), idea,
      })
    },

    recordAction(id, messageId) {
      const chat = chatOf(id)
      const message = chat.messages.find((held) => held.id === messageId)
      if (!message) throw new Error(`消息不存在:${messageId}`)
      const action = message.actions[0]
      if (action === undefined) throw new Error(`这条消息上没有要记入科研记录的话:${messageId}`)
      if (action.done === true) throw new Error('这一条已经记入过科研记录')
      const detail = appendEvent(action.project, `${CHAT_EVENT_PREFIX}${action.text}`)
      chats = chats.map((held) => (held !== chat ? held : {
        ...held,
        messages: held.messages.map((candidate) => (candidate !== message ? candidate : {
          ...candidate,
          actions: candidate.actions.map((candidateAction) => (candidateAction === action
            ? { ...candidateAction, done: true }
            : candidateAction)),
        })),
      }))
      save('chats', chats)
      return detail
    },

    setChatArchived(id, archived) {
      const chat = chatOf(id)
      chats = chats.map((c) => (c === chat ? { ...c, archived } : c))
      save('chats', chats)
    },

    search(query) {
      const needle = query.trim().toLowerCase()
      if (needle === '') return []
      const index: SearchHit[] = [
        ...wikiSearchIndex(wikiData),
        ...projects().map((p): SearchHit =>
          ({ kind: 'project', target: p.id, title: `项目:${p.name}`, meta: `${p.status} · ${p.topic}` })),
        ...chats.filter((c) => c.paperId === undefined || c.messages.length > 0).map((c): SearchHit =>
          ({ kind: 'chat', target: c.id, title: `对话:${c.title}`, meta: '对话' })),
        ...[...papers.values()].map((p): SearchHit => ({
          kind: 'paper', target: p.title, title: `论文:${p.title}`,
          meta: `${p.year ?? ''} ${p.venue}`.trim(),
        })),
      ]
      return index.filter((hit) => hit.title.toLowerCase().includes(needle)).slice(0, SEARCH_LIMIT)
    },
  }

  return withChangelog(ops, {
    load: (): ChangeRecord[] => load('changelog', ChangeRecordSchema),
    save: (rows) => { save('changelog', rows) },
    nextId: () => nextId('change'),
  })
}
