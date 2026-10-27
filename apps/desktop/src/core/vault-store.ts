import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { z } from 'zod'
import type {
  ChatSession, Conclusion, DeliverySettings, FeedEntry, FeedRun, GraphNode, IdeaFile, InboxStream, PaperColumns, PaperImportResult,
  PaperReading, PaperRow, Proposal,
  ProjectConclusion, ProjectDetail, ProjectWorkspaceBinding, ProposalRecord, ReadingMutation, RelationFields, ResearchGraph,
  ResearchIdea, Task, TaskFields,
  WikiAggregationCard, WikiSignal,
} from '../shared/contract.js'
import {
  DEFAULT_DELIVERY_SETTINGS, FeedEntrySchema, ProposalRecordSchema, ResearchIdeaSchema, WatchSchema,
} from '../shared/contract.js'
import { attachmentSizeText } from '../shared/attachment-size.js'
import { projectControlState } from '../shared/project-control.js'
import { projectTopics, sortRecordsNewestFirst } from '../shared/project-signals.js'
import { slugOf } from '../shared/slug.js'
import { newTopicPages, topicDir, topicProposal } from '../shared/topic-proposal.js'
import {
  ACTIVE_PROJECT, CHAT_EVENT_PREFIX, DEFAULT_PROJECT_TOPIC, FINISHED_PROJECT, PAPER_PAGE, PROJECTS_DIR, READ_STATES,
  TRASH_RETENTION_DAYS, UNREAD_PAPER,
} from '../shared/vocabulary.js'
import { CallError } from './call-error.js'
import type { ChangeRecord } from './changelog.js'
import { lastProgressOf, PROJECT_FIELDS, parseChangeRecords, withChangelog } from './changelog.js'
import { dayOf, feedNewestFirst, systemToday } from './dates.js'
import {
  applyReadingMutation, checkColumns, checkCustom, checkGroupKey, columnCells, emptyColumns,
  emptyPaperReading, facetPapers, freePageStem, laterWithMetadata, listPapers, liveColumns,
  missingMetadata, paperImportResult, parsePaperUpload, patchedCustom, publicationFill, readingNoteCount,
  remoteMetadata, renamedCell, renamedOptions, restoredColumn, retypedColumn, writePaperFields,
  type PaperWrite,
} from './paper-library/index.js'
import {
  chatSource, CONCLUSION_CHANGED, concludedNodes, conclusionCounts, conclusionFingerprint, MANUAL_SOURCE, overviewResearch, placeNode,
  projectConclusions, verifiedNodes, projectPageText, projectWorkspaceRoot, projectWorkspaceSsh, readProjectPage,
  readLocalProjectWorkspace, readProjectWorkspace, readWorkspaceAgentIdeaFiles, readWorkspaceAgentIdeas, readWorkspaceAgentTasks, withProjectLinks, writeProjectFields,
  writeProjectWorkspaceState, servedTopics, storedTopics, titledTopics, topicPinsOf, topicScopeOf, type ProjectRecord,
} from './project-management/index.js'
import { inboxFields } from './inbox/dedup.js'
import {
  combinedReasons, cutBelow, cutByRanking, listedUnder, orderListing, sortFound, streamsOf, withoutStreams, withStream,
} from './inbox/delivery.js'
import {
  createPaperIndex, doiField, libraryArxivId, libraryIdentity, paperIdentity, type PaperIdentity,
} from './inbox/identity.js'
import {
  buildRecommendationProfile, clusterRecommendationProfile, directionBasis, directionIntents, directionsAfter,
  batchIdOf, migratedDirections, mirroredDisabled, recommendationSeedIds, scannedDirections, shortTitleOf,
  type DirectionPaper, type DiscoveryPaper, type DiscoveryPreferences, type KnownPaper, type ProjectDirections,
  type RefreshScope, type ScopeRanking,
} from './recommendation/index.js'
import type { RemotePaper } from './net/arxiv.js'
import type { Publication } from './net/semantic-metadata.js'
import type { Json } from './vault/frontmatter.js'
import { emitKey } from './vault/frontmatter.js'
import type {
  ChatRecord, DiscoveryDirectionsRecord, IdeaFileRecord, InboxLeft, InboxRecord, PaperSnapshot, RefreshProgressRecord,
  TrashRecord, VaultState,
} from './vault/records.js'
import {
  ChatRecordSchema, DeliveredRecordSchema, DiscoveryDirectionsRecordSchema, DiscoveryPreferencesRecordSchema, IdeaFileRecordSchema,
  InboxRecordSchema, LaterRecordSchema,
  MetadataFillRecordSchema, PaperReadingRecordSchema, RefreshProgressRecordSchema, TrashRecordSchema, VaultStateSchema,
} from './vault/records.js'
import { readRecord, readStoredList, withUnknownFields, type StoredList } from './vault/stored-records.js'
import {
  movePage, removePage, replacePage, writeAtomically, writeImmutable, writeJson, writePage,
} from './vault/writer.js'
import { NO_WORKSPACE_GRAPHS, type MetadataFill, type VaultOps, type VaultStore, type WorkspaceGraphs } from './vault.js'
import {
  appendEntry, applyProposal, checkBody, checkGenerated, conclusionClaims, createAggregationPage, describeOp, experimentProjects,
  entryLine, fillGenerated, generatedChildren, generatedClaims, generatedMissing, generatedTable, HUMAN,
  isClaimOp, isPaper, labelledLink, labelOf, mergePlan, moveMembership, pageVersion, projectClaims, projectDisputes,
  readWikiData, readWikiPage, relabelled, removeClaim, removeMembership, rewriteLines, setAggregationMetadata, setAliases,
  setBody, setBodyAndTrust, setClaim, setColumns, setMembership, setParents, setUpdated, topicPages, touchedPages, wikiAggregation, wikiCards,
  wikiBacklinks, wikiHome, wikiPaper, wikiSignals,
  type ClaimWorld, type PointName, type WikiAggregationRecord, type WikiData, type WikiPaperRecord,
} from './wiki/index.js'
import { prepareFallbackLibrary } from './workspace-layout.js'
import { searchHits } from './search.js'
import { createResearchIdea, readResearchIdea, updateResearchIdea } from './research-ideas/index.js'

/** Page frontmatter: scalars are strings, sequences are string arrays, and blocks are string maps. */
type Frontmatter = Record<string, string | string[] | Record<string, string | string[]>>

/** A page read while scanning a directory. */
type Scanned = { id: string; file: string; front: Frontmatter; body: string }

/** Vault ID prefix used by page readers and writers to recognize project pages. */
const PROJECT_PATH = `${PROJECTS_DIR}/`

/** The Wiki page id of `wiki/<id>.md`, the vault-relative path a page's trash record keeps. */
const trashedPageId = (page: string): string => page.slice('wiki/'.length, -'.md'.length)

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
/** How often the feed re-reads bound workspaces for new research-record events. */
const WORKSPACE_EVENT_READ_MS = 60_000

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

/** Reads every page in a directory whose stem `keep` accepts, sorted by filename as this implementation's vault order. */
function scan(dir: string, keep: (stem: string) => boolean): Scanned[] {
  return readdirSync(dir).filter((name) => name.endsWith('.md') && keep(name.slice(0, -'.md'.length))).sort()
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
  if (task.end < task.start) throw new CallError('invalid', `任务结束日期早于开始日期：${task.start} – ${task.end}`)
  if (task.start === task.end && task.window && task.window.end <= task.window.start) {
    throw new CallError('invalid', `任务结束时间不晚于开始时间：${task.window.start} – ${task.window.end}`)
  }
}

/** Throws when a research-log entry contains a newline. */
function checkOneLine(text: string): void {
  if (text.includes('\n')) throw new CallError('invalid', '科研记录一条占一行，正文里不能有换行')
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
  if (!existsSync(paperDir)) throw new CallError('not-library', `库里没有论文页目录：${paperDir}`)
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

  /** Each list `load` read, by name, holding what its next `save` writes back besides the rows. */
  const lists = new Map<string, StoredList<unknown>>()
  /** The change log's rows as last loaded or saved. */
  let changes: ChangeRecord[] = []

  /**
   * Loads the record list in `.meridian/<name>.json` record by record, telling records apart by their
   * `key` field, or an empty list when the file does not exist.
   */
  const load = <T>(name: string, schema: z.ZodType<T>, key = 'id'): T[] => {
    const file = join(meridian, `${name}.json`)
    if (!existsSync(file)) return []
    const list = readStoredList(file, JSON.parse(readFileSync(file, 'utf8')), schema, key)
    lists.set(name, list)
    return list.rows
  }
  /**
   * Writes `rows` to `.meridian/<name>.json` and returns them. Throws, leaving the file as it stood,
   * when it cannot be written.
   */
  const save = <T>(name: string, rows: T[]): T[] => {
    writeJson(join(meridian, `${name}.json`), lists.get(name)?.stored(rows) ?? rows, staging)
    return rows
  }
  /** The record `.meridian/<name>.json` stores for `row`: `row` with the fields this version does not know put back. */
  const storedRecord = (name: string, row: unknown): unknown => lists.get(name)?.stored([row])[0] ?? row

  // Remove partial output from the previous run; destination pages were never modified and the debris is no longer useful.
  rmSync(staging, { recursive: true, force: true })

  const stateFile = join(meridian, 'state.json')
  const readState = existsSync(stateFile)
    ? readRecord(VaultStateSchema, JSON.parse(readFileSync(stateFile, 'utf8')))
    : { value: { seq: 0 }, unknown: [] }
  if ('error' in readState) throw new CallError('newer-version', `${stateFile} 这个版本读不了：${readState.error}`)
  let state: VaultState = readState.value
  /**
   * Writes `next` to `state.json` with the fields this version does not know put back, then holds it as
   * `state`. Throws, still holding the previous state, when the file cannot be written.
   */
  const saveState = (next: VaultState): void => {
    writeJson(stateFile, withUnknownFields(next, readState.unknown), staging)
    state = next
  }

  /** Returns an unused vault ID from a monotonically increasing sequence that survives restarts. */
  const nextId = (prefix: string): string => {
    saveState({ ...state, seq: state.seq + 1 })
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
  let ideaFiles = load('idea-files', IdeaFileRecordSchema)
  /**
   * The ids of the ideas the vault holds: listed, in the trash, or stored in a record this version
   * cannot read, which may be an idea or a trash entry holding one.
   */
  const heldIdeaIds = (): Set<string> => new Set([
    ...ideas.map((idea) => idea.id),
    ...trash.flatMap((item) => (item.kind === 'idea' ? [item.idea.id] : [])),
    ...[...lists.get('ideas')?.unreadable ?? [], ...lists.get('trash')?.unreadable ?? []].flatMap((record) => {
      const held = record as { id?: unknown; idea?: { id?: unknown } } | null
      return [held?.id, held?.idea?.id].filter((id): id is string => typeof id === 'string')
    }),
  ])
  // An older App purges an idea from the trash without knowing its files; they go once it is gone.
  {
    const held = heldIdeaIds()
    if (ideaFiles.some((file) => !held.has(file.idea))) ideaFiles = save('idea-files', ideaFiles.filter((file) => held.has(file.idea)))
  }
  let delivered = load('discovery/delivered', DeliveredRecordSchema)
  let readings = load('paper-readings', PaperReadingRecordSchema, 'paperId')
  let fills = load('metadata-fills', MetadataFillRecordSchema, 'paper')
  let progress: RefreshProgressRecord[] = load('discovery/progress', RefreshProgressRecordSchema)
  /** Whether a version that stores discovery directions opened this vault before. */
  const directionsStored = existsSync(join(meridian, 'discovery', 'directions.json'))
  let directions: DiscoveryDirectionsRecord[] = load('discovery/directions', DiscoveryDirectionsRecordSchema)

  /** The identity of the paper a stored inbox entry delivers. */
  const entryIdentity = (entry: InboxRecord): PaperIdentity => paperIdentity({
    arxiv: entry.arxiv, ...doiField(entry), semanticId: entry.semanticId,
    title: entry.title, submitted: entry.meta.submitted,
  })

  /** Remembers the papers `entries` deliver as delivered, each entry once. */
  const remember = (entries: InboxRecord[]): void => {
    const held = new Set(delivered.map((record) => record.id))
    const added = entries.filter((entry) => !held.has(entry.id))
      .map((entry) => ({ id: entry.id, ...entryIdentity(entry) }))
    if (added.length > 0) delivered = save('discovery/delivered', [...delivered, ...added])
  }

  /**
   * Takes the streams `gone` names off every inbox entry. An entry no stream lists anymore is removed
   * with its trash entries, and its paper remembered as delivered. Writes only what changed.
   */
  const dropStreams = (gone: (stream: InboxStream) => boolean): void => {
    const removed: InboxRecord[] = []
    let changed = false
    const next = inbox.flatMap((entry) => {
      const kept = withoutStreams(entry, gone)
      if (kept !== entry) changed = true
      if (kept === null) removed.push(entry)
      return kept === null ? [] : [kept]
    })
    if (!changed) return
    remember(removed)
    inbox = save('inbox', next)
    const ids = new Set(removed.map((entry) => entry.id))
    const kept = trash.filter((item) => item.kind !== 'inbox' || !ids.has(item.entryId))
    if (kept.length !== trash.length) trash = saveTrash(kept)
  }
  // Another App version may have written queue records this one cannot read; keep those as written.
  const heldProposals: unknown[] = existsSync(join(meridian, 'proposals.json'))
    ? JSON.parse(readFileSync(join(meridian, 'proposals.json'), 'utf8')) as unknown[] : []
  let proposals: ProposalRecord[] = []
  const unreadProposals: unknown[] = []
  for (const [at, held] of heldProposals.entries()) {
    const parsed = ProposalRecordSchema.safeParse(held)
    if (parsed.success) proposals.push(parsed.data)
    else {
      unreadProposals.push(held)
      console.error(`[wiki] proposal queue record ${at + 1} cannot be read by this version and is kept as it is (the App may need an update): ${parsed.error.message}`)
    }
  }
  const inboxDir = join(meridian, 'proposal-inbox')

  // Older versions left watch-derived recommendations in inbox.json after a watch was removed.
  // They have no reachable sidebar destination and pollute the combined feed and deduplication history, so remove them on open.
  // A watch this version cannot read still owns its entries.
  const knownWatches = new Set<unknown>([
    ...watches.map((watch) => watch.id),
    ...(lists.get('watches')?.unreadable ?? []).map((watch) => (watch as { id?: unknown }).id),
  ])
  dropStreams((stream) => stream.kind === 'watch' && !knownWatches.has(stream.id))

  const projectById = new Map<string, ProjectRecord>()
  /** Ids of the project pages this version cannot read; they are left out and never written. */
  const unreadableProjects = new Set<string>()
  for (const name of existsSync(projectDir) ? readdirSync(projectDir).filter((n) => n.endsWith('.md')) : []) {
    const id = name.slice(0, -'.md'.length)
    try {
      projectById.set(id, readProjectPage(join(projectDir, name), id))
    } catch (err) {
      unreadableProjects.add(id)
      console.error(`[project] ${join(projectDir, name)} cannot be read by this version and is skipped (the App may need an update): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  dropStreams((stream) => stream.kind === 'discovery' && !projectById.has(stream.id) && !unreadableProjects.has(stream.id))

  const paperScan = scan(paperDir, (stem) => wikiData.pages[PAPER_PAGE + stem] !== undefined)

  /** Every paper page in the vault, keyed by its filename-derived ID. */
  const papers = new Map<string, PaperRow>()

  /** Reading interaction for a paper, returning an unshared empty state when no record exists. */
  const readingOf = (id: string): PaperReading => structuredClone(
    readings.find((reading) => reading.paperId === id) ?? emptyPaperReading(id),
  )

  /** Persists `next` as paper `id`'s reading state and projects its note count and remark onto the paper's row. */
  const storeReading = (id: string, next: PaperReading): void => {
    readings = save('paper-readings', [...readings.filter((reading) => reading.paperId !== id), next])
    const row: PaperRow = {
      ...papers.get(id)!,
      noteCount: readingNoteCount(next),
    }
    if (next.remark === '') delete row.remark
    else row.remark = next.remark
    papers.set(id, row)
  }

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
   * current aggregation of a modified paper in `next`. A claim op refills every
   * aggregation it writes; a revision also refills every page whose claims
   * conflict with the revised one, since those render its text. `before`
   * supplies old parents and the other side of a closed conflict. A page
   * `next` does not hold, such as one this version cannot read, is left out.
   */
  const refilled = (proposal: Proposal, before: WikiData, next: WikiData): string[] => {
    const out: string[] = []
    const add = (id: string): void => { if (!out.includes(id)) out.push(id) }
    for (const id of touchedPages({ ops: proposal.ops.filter(isClaimOp) }, before)) add(id)
    for (const op of proposal.ops) {
      if (op.op !== 'reviseClaim') continue
      const ref = `${op.page}#${op.claim}`
      for (const [id, page] of Object.entries(next.pages)) {
        if (isPaper(page)) continue
        if ((page.fm.claims ?? []).some((c) => (c.conflicts ?? []).some((x) => x.against.kind === 'claim' && x.against.ref === ref))) add(id)
      }
    }
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
    return out.filter((id) => next.pages[id] !== undefined)
  }

  /**
   * Refills the generated regions of each aggregation `ids` names from `data`. A page written before
   * the claims region existed gains it only once it holds a claim.
   */
  const refill = (data: WikiData, ids: string[]): void => {
    const names = projectNames()
    for (const id of ids) {
      const claims = (data.pages[id] as WikiAggregationRecord).fm.claims ?? []
      fillGenerated(wikiFile(id), {
        children: generatedChildren(data, id), table: generatedTable(data, id),
        ...(claims.length === 0 && generatedMissing(wikiFile(id)).includes('claims')
          ? {} : { claims: generatedClaims(data, id, names) }),
      }, staging)
    }
  }

  /** The id of every aggregation in the Wiki as it stands. */
  const aggregationIds = (): string[] => Object.keys(wikiData.pages).filter((id) => !isPaper(wikiData.pages[id]!))

  /** The page id of every paper with a membership in Wiki page `id`. */
  const memberPapers = (id: string): string[] => Object.keys(wikiData.pages).filter((other) => {
    const page = wikiData.pages[other]!
    return isPaper(page) && (page.fm.memberships ?? []).some((m) => m.in === id)
  })

  /** The other aggregations directly under aggregation `id`, in id order. */
  const subpagesOf = (id: string): string[] => aggregationIds().sort()
    .filter((other) => ((wikiData.pages[other] as WikiAggregationRecord).fm.parents ?? []).includes(id))

  /** The parents subpage `child` of aggregation `id` takes once `id` is deleted: `id` gives way to its own parents. */
  const parentsAfterDelete = (id: string, child: string): string[] => {
    const up = (wikiData.pages[id] as WikiAggregationRecord).fm.parents ?? []
    const held = (wikiData.pages[child] as WikiAggregationRecord).fm.parents ?? []
    return [...new Set(held.flatMap((p) => (p === id ? up : [p])))].filter((p) => p !== child)
  }

  /**
   * What merging aggregation `from` into `into` writes: the text after the merge of every page it
   * changes, worked out on copies in a scratch folder under the staging folder (which opening the
   * vault clears). Writes nothing in the vault. Throws as mergeWikiPages does, but for `changed`.
   */
  const mergeOutcome = (from: string, into: string): { id: string; after: string }[] => {
    checkReadable(from)
    checkReadable(into)
    const plan = mergePlan(wikiData, from, into)
    for (const id of aggregationIds()) checkGenerated(wikiFile(id))
    const day = today()
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const relation = new RegExp(`^(\\s*(?:- )?page: )(["']?)${escaped}\\2(\\s*)$`)
    const rewrite = (id: string) => (line: string, part: 'front' | 'body'): string => (part === 'body'
      ? plan.rewriteLink(line)
      : id.startsWith(PROJECT_PATH) ? line.replace(relation, (_, head: string, quote: string, tail: string) => `${head}${quote}${into}${quote}${tail}`) : line)
    const projects = [...projectById.keys()].sort().map((pid) => `${PROJECT_PATH}${pid}`)
      .filter((id) => readFileSync(wikiFile(id), 'utf8').split('\n').some((line) => {
        const bare = line.replace(/\r$/, '')
        return rewrite(id)(bare, 'front') !== bare || rewrite(id)(bare, 'body') !== bare
      }))
    const stamped = [into, ...plan.members.map((m) => m.paper), ...plan.children.map((c) => c.page), ...plan.claims.map((c) => c.page)]
    const ids = [...new Set([...stamped, ...plan.links, ...projects])]
    mkdirSync(staging, { recursive: true })
    const scratch = mkdtempSync(join(staging, 'merge-'))
    try {
      const at = (id: string): string => join(scratch, `${id}.md`)
      const work = join(scratch, '.staging')
      for (const id of ids) {
        mkdirSync(dirname(at(id)), { recursive: true })
        copyFileSync(wikiFile(id), at(id))
      }
      const target = wikiData.pages[into] as WikiAggregationRecord
      const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
      const fields = plan.intoFields
      if (!same(target.fm.aliases ?? [], fields.aliases)) setAliases(at(into), fields.aliases, work)
      if (!same(target.fm.parents ?? [], fields.parents)) setParents(at(into), fields.parents, work)
      if (!same(target.fm.columns ?? [], fields.columns)) setColumns(at(into), fields.columns, work)
      const held = new Map((target.fm.claims ?? []).map((c) => [c.id, c]))
      for (const claim of fields.claims) if (!same(held.get(claim.id), claim)) setClaim(at(into), claim, work)
      if (fields.body !== null) setBody(at(into), fields.body, work)
      for (const { paper, cells } of plan.members) {
        if (cells === null) moveMembership(at(paper), from, into, work)
        else {
          setMembership(at(paper), { in: into, cells }, work)
          removeMembership(at(paper), from, work)
        }
      }
      for (const { page, parents } of plan.children) setParents(at(page), parents, work)
      for (const { page, claim } of plan.claims) setClaim(at(page), claim, work)
      for (const id of ids) rewriteLines(at(id), rewrite(id), work)
      for (const id of ids) if (!id.startsWith(PROJECT_PATH)) setUpdated(at(id), day, work)
      return ids.map((id) => ({ id, after: readFileSync(at(id), 'utf8') }))
        .filter((t) => t.after !== readFileSync(wikiFile(t.id), 'utf8'))
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }

  /**
   * Rereads wiki structure after a write, recomputes table rows for the affected paper pages, and
   * rewrites the Wiki signals file.
   */
  const rereadWiki = (paths: string[]): void => {
    wikiData = readWikiData(wiki)
    for (const path of paths) {
      if (!path.startsWith(PAPER_PAGE)) continue
      const stem = path.slice(PAPER_PAGE.length)
      const page = wikiData.pages[path]
      if (page === undefined) papers.delete(stem)
      else papers.set(stem, withReadingCount(paperRowOf(wikiData, stem, page as WikiPaperRecord)))
    }
    writeSignals()
  }

  /** Throws when Wiki page `id` has a file that the Wiki left out because this version cannot read it. */
  const checkReadable = (id: string): void => {
    if (wikiData.pages[id] === undefined && existsSync(wikiFile(id))) throw new CallError('newer-version', `wiki 页这个版本读不了（可能要更新 App）：${id}`)
  }

  /** Page version of Wiki page `id`, null when it has no file. Throws if a part of the id is `.` or `..`. */
  const versionOf = (id: string): ReturnType<typeof pageVersion> => {
    if (id.split('/').some((part) => part === '.' || part === '..')) throw new CallError('invalid', `页 id 不能含 . 或 ..:${id}`)
    const file = wikiFile(id)
    return existsSync(file) ? pageVersion(readFileSync(file, 'utf8')) : null
  }

  /** Every project's name, by id. */
  const projectNames = (): Record<string, string> =>
    Object.fromEntries([...projectById.values()].map((p) => [p.id, p.name]))

  /**
   * The research graph `project`'s workspace holds: a local workspace's as it stands, an SSH one's as
   * `graphs` holds it. Throws when the workspace is an SSH one `graphs` does not hold.
   */
  const workspaceGraph = (project: ProjectRecord, graphs: WorkspaceGraphs): ResearchGraph | undefined => {
    if (project.workspaceSsh === undefined) return readLocalProjectWorkspace(project)?.graph
    if (!graphs.has(project.id)) throw new Error(`项目 ${project.id} 的 SSH 工作区没有先读`)
    return graphs.get(project.id)
  }

  /** Reads afresh the SSH workspace of each of `ids` that has one; see VaultStore.readWorkspaceGraphs. */
  const readWorkspaceGraphs = async (ids: readonly string[]): Promise<WorkspaceGraphs> => {
    const bound = ids.flatMap((id) => {
      const project = projectById.get(id)
      return project?.workspaceSsh === undefined ? [] : [project]
    })
    return new Map(await Promise.all(bound.map(async (project) => {
      const workspace = await readProjectWorkspace(project)
      remoteRead.set(project.id, workspace)
      return [project.id, workspace?.graph] as const
    })))
  }

  /** The label of a project's node (workspace nodes included, SSH ones from `graphs`) or the text of its legacy conclusion. */
  const pointName = (graphs: WorkspaceGraphs): PointName => (id, point) => {
    const project = projectById.get(id)
    if (project === undefined) return undefined
    const nodes = [...project.graph.nodes, ...workspaceGraph(project, graphs)?.nodes ?? []]
    return nodes.find((n) => n.id === point)?.label ?? project.conclusionList.find((c) => c.id === point)?.text
  }

  /**
   * The claim-validation world for producer `by`: the vault's projects (with workspace nodes, SSH ones
   * from `graphs`) and reading records.
   */
  const worldOf = (by: string, graphs: WorkspaceGraphs, requireVerified = true): ClaimWorld => ({
    by,
    requireVerified,
    project: (id) => {
      const project = projectById.get(id)
      if (project === undefined) return undefined
      const workspace = workspaceGraph(project, graphs)
      const graph = workspace ?? project.graph
      return {
        nodes: [...project.graph.nodes, ...workspace?.nodes ?? []].map((n) => n.id),
        conclusions: project.conclusionList.map((c) => c.id),
        concluded: concludedNodes(graph).map((n) => n.id),
        verified: [...verifiedNodes(project, graph).keys()],
        verifiedConclusions: project.conclusionList.filter((c) => c.state === 'verified').map((c) => c.id),
      }
    },
    reading: (paper) => {
      const reading = readingOf(paper.slice(PAPER_PAGE.length))
      return { highlights: reading.highlights.map((h) => h.id), notes: reading.notes.map((n) => n.id) }
    },
  })

  /** The Wiki signals of the vault as it stands. */
  const signals = (): WikiSignal[] => wikiSignals(wikiData, {
    projects: [...projectById.values()].map((p) => ({
      id: p.id,
      pages: [
        ...p.relations.flatMap((g) => g.items.flatMap((item) => (item.page === undefined ? [] : [item.page]))),
        ...p.graph.nodes.flatMap((n) => n.writebacks.map((w) => w.page)),
      ],
    })),
    trashed: new Map(trash.flatMap((item) => (item.kind === 'paper'
      ? [[`${PAPER_PAGE}${basename(item.page, '.md')}`, item.title] as const]
      : item.kind === 'page' ? [[trashedPageId(item.page), item.title] as const] : []))),
    missingRegions: Object.keys(wikiData.pages).sort()
      .filter((id) => !isPaper(wikiData.pages[id]!) && generatedMissing(wikiFile(id)).some((name) => name !== 'claims')),
  })

  /** Rewrites `.meridian/wiki-signals.json` with the signals of the vault as it stands. */
  const writeSignals = (): void => {
    writeJson(join(meridian, 'wiki-signals.json'), { generated_at: now().toISOString(), signals: signals() }, staging)
  }
  writeSignals()

  /** Returns the immutable source referenced by a paper page, or an empty string without `source_id`. */
  const sourceOf = (id: string): string => scalar(readPage(paperFile(id)).front, 'source_id')

  /** Returns the file name of paper `id`'s source PDF under `sources/papers`, or undefined when the vault holds none. */
  const pdfOf = (id: string): string | undefined => {
    const source = sourceOf(id)
    return source === ''
      ? undefined
      : readdirSync(join(root, 'sources', 'papers')).find((name) => name.startsWith(`${source}-`) && name.endsWith('.pdf'))
  }

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

  /** Returns a project by ID. Throws when the vault has no such project, or cannot read its page. */
  /** Throws unless `scope` names a project or a watch this vault holds. */
  const scopeOf = (scope: RefreshScope): void => {
    if (scope.kind === 'project') projectOf(scope.id)
    else if (!watches.some((watch) => watch.id === scope.id)) throw new CallError('not-found', `关注不存在：${scope.id}`)
  }

  const projectOf = (id: string): ProjectRecord => {
    const project = projectById.get(id)
    if (!project) {
      throw unreadableProjects.has(id)
        ? new CallError('newer-version', `项目页这个版本读不了（可能要更新 App）：${id}`)
        : new CallError('not-found', `项目不存在：${id}`)
    }
    return project
  }

  /**
   * The text and target of a relation item. Throws when `page` names no aggregation of the
   * vault, or both targets are given.
   */
  const relationFields = ({ text, page, url }: Omit<RelationFields, 'group'>) => {
    if (page !== undefined) {
      const target = wikiData.pages[page]
      if (target === undefined || isPaper(target)) throw new CallError('not-found', `wiki 聚合不存在：${page}`)
    }
    if (page !== undefined && url !== undefined) throw new CallError('invalid', '关联不能同时指向 Wiki 页和链接')
    return { text, ...(page === undefined ? {} : { page }), ...(url === undefined ? {} : { url }) }
  }

  /** The conclusions of `project` whose research graph is `graph`, as the Conclusions view lists them. */
  const conclusionsOf = (project: ProjectRecord, graph: ResearchGraph): ProjectConclusion[] =>
    projectConclusions(project, graph, projectClaims(wikiData, project.id), projectDisputes(wikiData, project.id))

  /** Project `id` for its detail. Throws when there is none, or its research graph has an edge to a node it does not hold. */
  const shownProject = (id: string): ProjectRecord => {
    const project = projectOf(id)
    const nodeIds = new Set(project.graph.nodes.map((n) => n.id))
    for (const [from, to] of project.graph.edges) {
      if (!nodeIds.has(from) || !nodeIds.has(to)) {
        throw new CallError('invalid', `科研图的边指向不存在的节点：${from} → ${to}`)
      }
    }
    return project
  }

  /** The events a project's workspace holds. */
  type WorkspaceEvents = NonNullable<ProjectDetail['workspace']>['events']

  /** Each SSH-bound project's workspace as its latest read found it, by project id. */
  const remoteRead = new Map<string, ProjectDetail['workspace']>()

  /** The cross-boundary project detail of `project` with `workspace`, deriving paper counts and titles from current vault state. */
  const detailWith = (project: ProjectRecord, workspace: ProjectDetail['workspace']): ProjectDetail => {
    const stored: Omit<ProjectRecord, 'created'> & { created?: string } = structuredClone(project)
    delete stored.created
    delete stored.workspaceRoot
    delete stored.workspaceSsh
    delete stored.agentTasks
    delete stored.topics
    delete stored.topicPins
    const paperTitles = Object.fromEntries(stored.papers.flatMap((id) => {
      const paper = papers.get(id)
      return paper === undefined ? [] : [[id, paper.title]]
    }))
    const claims = conclusionClaims(wikiData, project.id)
    const conclusions = conclusionsOf(project, workspace?.graph ?? project.graph)
    return {
      ...stored,
      ...served(project),
      paperTitles,
      paperCount: Object.keys(paperTitles).length,
      conclusions: conclusionCounts(conclusions),
      ...(Object.keys(claims).length === 0 ? {} : { conclusionClaims: claims }),
      projectConclusions: conclusions,
      ...(workspace === undefined ? {} : { workspace }),
      ...lastProgressOf(changes, project.id, [...project.events, ...workspace?.events ?? []]),
    }
  }

  /** The project detail of `project`, reading its workspace afresh. */
  const detailOf = async (project: ProjectRecord): Promise<ProjectDetail> => {
    // Inside `atomically` a write queues its workspace sync only once all of it has landed, later in
    // this turn; reading in a later turn keeps this read behind that sync.
    if (syncing !== undefined) await Promise.resolve()
    const workspace = await readProjectWorkspace(project)
    if (project.workspaceSsh !== undefined) remoteRead.set(project.id, workspace)
    return detailWith(project, workspace)
  }

  /** Returns projects in canonical order rather than directory scan or trash-restoration order. */
  const projects = (): ProjectRecord[] => [...projectById.values()].sort(byCreated)

  /** The topic fields Core serves for `project`, as the vault's topic pages stand now. */
  const served = (project: ProjectRecord) => servedTopics(project, topicPages(wikiData))

  /** The topic fields of `project` that list views add: the served ones and the topic scope. */
  const listedTopics = (project: ProjectRecord) => {
    const fields = served(project)
    const scope = topicScopeOf((fields.topicPages ?? []).flatMap((page) => (page === null ? [] : [page])), topicPages(wikiData))
    return { ...fields, ...(scope.length === 0 ? {} : { topicScope: scope }) }
  }

  /**
   * Creates a top-level topic page for each of `titles` that no topic page carries, through the
   * Wiki's own proposal path. Throws for a title with no letter or digit, or a Wiki without topics.
   */
  const fileTopics = (titles: readonly string[]): void => {
    const filing = newTopicPages(titles, wikiCards(wikiData), () => topicDir(wikiHome(wikiData)))
    if (filing !== null) ops.applyProposal(filing)
  }

  /** Archives active linked ideas when a project finishes; reopening the project does not reverse this automatically. */
  const archiveIdeasForProject = (projectId: string): void => {
    const day = today()
    let changed = false
    const next = ideas.map((idea) => {
      if (idea.project !== projectId || idea.archived) return idea
      changed = true
      return { ...idea, archived: true, updated: day }
    })
    if (changed) ideas = save('ideas', next)
  }

  /** Projects whose workspace projection the running atomically call refreshes once all of it lands. */
  let syncing: Set<string> | undefined

  /**
   * Runs `write`, which writes the vault more than once, so that it lands as a whole or not at all: when
   * it throws, writeAtomically puts back the writes of it that landed, every list and index this store
   * holds goes back to what it held before, and the error is rethrown. The workspace projections it
   * refreshes are refreshed only once all of it has landed. A call made inside another joins that one.
   */
  const atomically = <T>(write: () => T): T => {
    if (syncing !== undefined) return write()
    const held = { wikiData, state, inbox, later, watches, chats, ideas, feed, trash, delivered, readings, fills, proposals, changes }
    const indexes = [papers, pagesOf, projectById].map((index: Map<string, unknown>) => ({ index, was: new Map(index) }))
    const synced = new Set<string>()
    syncing = synced
    let result: T
    try {
      result = writeAtomically(staging, write)
    } catch (error) {
      ({ wikiData, state, inbox, later, watches, chats, ideas, feed, trash, delivered, readings, fills, proposals, changes } = held)
      for (const { index, was } of indexes) {
        index.clear()
        for (const [key, value] of was) index.set(key, value)
      }
      throw error
    } finally {
      syncing = undefined
    }
    for (const id of synced) {
      const project = projectById.get(id)
      if (project !== undefined) syncProjectWorkspace(project)
    }
    return result
  }

  /** `op` made one write by atomically. */
  const atomic = <A extends unknown[], R>(op: (...args: A) => R) => (...args: A): R => atomically(() => op(...args))

  /**
   * Refreshes the App-owned workspace projection without making project edits depend on transport
   * health: a local workspace at once, an SSH one in the project's turn, after the call returns.
   */
  const syncProjectWorkspace = (project: ProjectRecord): void => {
    if (project.workspaceRoot === undefined && project.workspaceSsh === undefined) return
    if (syncing !== undefined) {
      syncing.add(project.id)
      return
    }
    writeProjectWorkspaceState(project, ideas).catch((error: unknown) => {
      console.warn(`[project] workspace sync failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  /**
   * Takes ideas coding agents recorded in bound local workspaces into the idea list, each once, not
   * started, with the bound project as the project it was sparked in; a node the agent attached is
   * kept as a candidate.
   */
  const absorbAgentIdeas = atomic((): void => {
    const taken = new Set(state.agentIdeas ?? [])
    const ids = { ...state.agentIdeaIds }
    const added: ResearchIdea[] = []
    for (const project of projects()) {
      const fresh = readWorkspaceAgentIdeas(project.workspaceRoot).filter((found) => !taken.has(`${project.id}:${found.id}`))
      for (const found of fresh) {
        taken.add(`${project.id}:${found.id}`)
        const idea = createResearchIdea(nextId('idea'), found.title, found.body, {
          chatTitle: found.context ?? project.name, agent: true,
        }, found.date)
        ids[`${project.id}:${found.id}`] = idea.id
        added.push({ ...idea, sourceProject: project.id, ...(found.node === undefined ? {} : { candidateNode: found.node }) })
      }
    }
    if (added.length > 0) ideas = save('ideas', [...added, ...ideas])
    const files = absorbAgentIdeaFiles(ids)
    if (added.length === 0 && files === 0 && Object.keys(ids).length === Object.keys(state.agentIdeaIds ?? {}).length) return
    saveState({ ...state, agentIdeas: [...taken], ...(Object.keys(ids).length === 0 ? {} : { agentIdeaIds: ids }) })
  })

  /** The agent idea files already reported as waiting, by `<project id>:<file id>`, so each is reported once. */
  const waitingFiles = new Set<string>()

  /**
   * Takes the idea files coding agents attached in bound local workspaces into the idea files, each
   * once, kept where they are in the workspace. A file names its idea by the id the agent gave it,
   * which `ids` maps to the vault idea, or by the vault id of an idea carried out in that project. An
   * agent idea `ids` does not map is matched by its project, title and date, and the match added to
   * `ids`. A file whose idea is not found, or that is missing or outside the workspace, waits and is
   * reported. Returns how many files it took in.
   */
  const absorbAgentIdeaFiles = (ids: Record<string, string>): number => {
    const taken = new Set(state.agentIdeaFiles ?? [])
    const held = heldIdeaIds()
    const known = [...ideas, ...trash.flatMap((item) => (item.kind === 'idea' ? [item.idea] : []))]
    const added: IdeaFileRecord[] = []
    for (const project of projects()) {
      const root = project.workspaceRoot
      const requests = readWorkspaceAgentIdeaFiles(root).filter((request) => !taken.has(`${project.id}:${request.id}`))
      if (root === undefined || requests.length === 0) continue
      const agentIdeas = readWorkspaceAgentIdeas(root)
      const ideaOf = (named: string): string | undefined => {
        const key = `${project.id}:${named}`
        const found = agentIdeas.find((agentIdea) => agentIdea.id === named)
        const matched = ids[key] ?? (found === undefined ? undefined : known.find((idea) => idea.source.agent === true
          && idea.sourceProject === project.id && idea.title === found.title && idea.created === found.date)?.id)
        if (matched !== undefined) {
          ids[key] = matched
          return held.has(matched) ? matched : undefined
        }
        return ideas.find((idea) => idea.id === named && idea.project === project.id)?.id
      }
      for (const request of requests) {
        const key = `${project.id}:${request.id}`
        const idea = ideaOf(request.idea_id)
        const path = resolve(root, request.path)
        const inside = !isAbsolute(request.path) && !relative(root, path).startsWith('..')
        if (idea === undefined || !inside || !existsSync(path) || !statSync(path).isFile()) {
          if (!waitingFiles.has(key)) {
            waitingFiles.add(key)
            console.error(`[workspace] ${root}: idea file ${request.id} waits: ${idea === undefined ? `no idea ${request.idea_id}` : `no file ${request.path} inside the workspace`}`)
          }
          continue
        }
        taken.add(key)
        added.push({ id: nextId('att'), name: basename(path), size: attachmentSizeText(statSync(path).size), path, idea })
      }
    }
    if (added.length === 0) return 0
    ideaFiles = save('idea-files', [...added.reverse(), ...ideaFiles])
    saveState({ ...state, agentIdeaFiles: [...taken] })
    return added.length
  }

  /** An idea file as the contract carries it. */
  const ideaFileOf = ({ idea, ...attachment }: IdeaFileRecord): IdeaFile => ({ idea, attachment: structuredClone(attachment) })

  /** Appends one feed entry dated now. */
  const appendFeedEntry = (source: FeedEntry['source'], runs: FeedRun[]): void => {
    const day = today()
    feed = save('feed', [...feed, {
      id: nextId('entry'), source, day: dayOf(day, day), time: FEED_NOW,
      createdAt: now().toISOString(),
      body: { kind: 'runs', runs: structuredClone(runs) },
    }])
  }

  let eventsReadAt = Number.NEGATIVE_INFINITY
  /**
   * Copies research-record events that coding agents wrote in bound workspaces into the feed as Lab
   * entries, each once. The first pass only marks existing events as seen, so an existing history does
   * not flood the feed; workspaces are read at most once a minute because an SSH binding means a round trip.
   */
  const absorbWorkspaceEvents = async (): Promise<void> => {
    const at = now().getTime()
    if (at - eventsReadAt < WORKSPACE_EVENT_READ_MS) return
    eventsReadAt = at
    const bound = projects().filter((project) => project.workspaceRoot !== undefined || project.workspaceSsh !== undefined)
    takeWorkspaceEvents(await Promise.all(bound.map(async (project) => ({
      project, events: (await readProjectWorkspace(project))?.events ?? [],
    }))))
  }

  /** The Lab entries absorbWorkspaceEvents writes for `read`, each project's workspace events as read; a project gone meanwhile is left out. */
  const takeWorkspaceEvents = atomic((read: { project: ProjectRecord; events: WorkspaceEvents }[]): void => {
    const first = state.feedEvents === undefined
    const seen = new Set(state.feedEvents ?? [])
    const fresh: { project: ProjectRecord; text: string }[] = []
    for (const { project, events } of read) {
      if (!projectById.has(project.id)) continue
      for (const event of events) {
        const key = `${project.id}:${event.date}:${event.text}`
        if (seen.has(key)) continue
        seen.add(key)
        fresh.push({ project, text: event.text.replace(/^\[agent\] /, '') })
      }
    }
    if (!first && fresh.length === 0) return
    if (!first) {
      for (const event of fresh) {
        appendFeedEntry('lab', [
          { kind: 'strong', text: `「${event.project.name}」`, target: { kind: 'project', id: event.project.id } },
          { kind: 'text', text: event.text },
        ])
      }
    }
    saveState({ ...state, feedEvents: [...seen] })
  })

  /** Current paper rows augmented with links and conclusions stored on projects. */
  const linkedRows = (): PaperRow[] => {
    const held = projects()
    return [...papers.values()].map((row) => withProjectLinks(row, held))
  }

  /**
   * The one path that adds a task to a plan, for the user and for agents alike (see VaultOps.createTask):
   * writes it at once and returns the project as written.
   */
  const addTask = (projectId: string, task: TaskFields, origin?: 'agent'): ProjectRecord => {
    const project = projectOf(projectId)
    checkSpan(task)
    const made = { ...task, id: nextId('task'), ...(origin === undefined ? {} : { origin }) }
    const next = { ...project, tasks: [made, ...project.tasks] }
    landProject(next, ['tasks'])
    return next
  }

  /**
   * Writes only the modified project fields to its page and archives the project's ideas when it is
   * finished, at once. Throws when any of it cannot be written, leaving the page, the ideas and the
   * record held as they stood and the workspace unsynced.
   */
  const landProject = (project: ProjectRecord, fields: (keyof ProjectRecord)[], syncWorkspace = true): void => {
    atomically(() => {
      writeProjectFields(projectFile(project.id), project, fields, staging)
      projectById.set(project.id, project)
      if (project.status === FINISHED_PROJECT) archiveIdeasForProject(project.id)
    })
    if (syncWorkspace) syncProjectWorkspace(project)
  }

  /**
   * Writes the project as landProject does, at once, and returns the updated detail. Throws as
   * landProject does.
   */
  const writeProject = (
    project: ProjectRecord, fields: (keyof ProjectRecord)[], syncWorkspace = true,
  ): Promise<ProjectDetail> => {
    landProject(project, fields, syncWorkspace)
    return detailOf(project)
  }

  /** Returns a live inbox entry. Throws when the ID is absent or already removed. */
  const liveEntry = (id: string): InboxRecord => {
    const entry = inbox.find((e) => e.id === id && !e.gone)
    if (!entry) throw new CallError('not-found', `收件里没有这一条：${id}`)
    return entry
  }

  /** Applies a patch to an inbox entry and persists the list. */
  const putEntry = (id: string, patch: Partial<InboxRecord>): void => {
    inbox = save('inbox', inbox.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  /** Takes an inbox entry out of the feed for good, recording `left` as why, along with `patch`. */
  const leaveEntry = (id: string, left: InboxLeft, patch: Partial<InboxRecord> = {}): void => {
    putEntry(id, { ...patch, gone: true, left })
  }

  /** Returns a chat by ID. Throws when the vault has no such chat. */
  const chatOf = (id: string): ChatRecord => {
    const chat = chats.find((c) => c.id === id)
    if (!chat) throw new CallError('not-found', `会话不存在：${id}`)
    return chat
  }

  const chatSession = ({ id, title, archived, messages, paperId }: ChatRecord): ChatSession => ({
    id, title, archived, messageCount: messages.length,
    ...(paperId === undefined ? {} : { paperId }),
  })

  /** Appends a dated project research-log entry, optionally linked to a research-graph node. */
  const appendEvent = (projectId: string, text: string, node?: string): Promise<ProjectDetail> => {
    const project = projectOf(projectId)
    checkOneLine(text)
    if (node !== undefined && !project.graph.nodes.some((item) => item.id === node)) {
      throw new CallError('not-found', `节点不存在：${node}`)
    }
    return writeProject(
      {
        ...project,
        events: [
          ...project.events,
          {
            date: today(), text, kind: 'note' as const,
            ...(node === undefined ? {} : { node }),
          },
        ],
      },
      ['events'],
    )
  }

  /**
   * Permanently removes a page held by a trash record; record kinds without pages need no file removal.
   * Callers save the trash without the record first, so a record never outlives its page.
   */
  const discard = (item: TrashRecord): void => {
    if (item.kind === 'paper' || item.kind === 'project' || item.kind === 'page') removePage(trashPage(item.id))
    if (item.kind === 'idea' && ideaFiles.some((file) => file.idea === item.idea.id)) {
      ideaFiles = save('idea-files', ideaFiles.filter((file) => file.idea !== item.idea.id))
    }
  }

  /** Permanently removes expired trash records and their stored content. */
  const dropExpired = (): void => {
    const cutoff = nowMs() - TRASH_RETENTION_DAYS * 86_400_000
    const expired = trash.filter((item) => item.deletedAt <= cutoff)
    if (expired.length === 0) return
    trash = saveTrash(trash.filter((item) => item.deletedAt > cutoff))
    for (const item of expired) discard(item)
  }

  /** Throws, before anything is written, when a page already stands where the page `item` holds goes back. */
  const checkPlaceFree = (item: Extract<TrashRecord, { kind: 'paper' | 'project' | 'page' }>): void => {
    if (existsSync(join(root, item.page))) throw new CallError('refused', `原来的位置已经被另一页占了，恢复会盖掉它：${item.page}`)
  }

  /** The chat the paper of the paper chat `item` holds has now, or undefined when it has none or `item` holds an ordinary chat. */
  const paperChatNow = (item: Extract<TrashRecord, { kind: 'chat' }>): ChatRecord | undefined =>
    (item.chat.paperId === undefined ? undefined : chats.find((held) => held.paperId === item.chat.paperId))

  /**
   * Sets each idea `moves` names, while it still relates to the pages `from`, to relate to the pages
   * `to` instead, its other fields untouched, and refreshes the workspace of each project those ideas
   * are carried out in.
   */
  const relateIdeas = (moves: { id: string; from: string[]; to: string[] }[]): void => {
    const changed = new Set<string>()
    const next = ideas.map((idea) => {
      const move = moves.find((m) => m.id === idea.id)
      if (move === undefined || JSON.stringify(idea.relations?.pages ?? []) !== JSON.stringify(move.from)) return idea
      changed.add(idea.id)
      return { ...idea, relations: { projects: idea.relations?.projects ?? [], ...idea.relations, pages: move.to } }
    })
    if (changed.size === 0) return
    ideas = save('ideas', next)
    for (const idea of next) {
      if (!changed.has(idea.id) || idea.project === undefined) continue
      const project = projectById.get(idea.project)
      if (project !== undefined) syncProjectWorkspace(project)
    }
  }

  /** Puts the ideas the merge that trashed page record `item` repointed back on the pages they related to before it. */
  const putIdeasBack = (item: Extract<TrashRecord, { kind: 'page' }>): void =>
    relateIdeas((item.ideas ?? []).map(({ id, before, after }) => ({ id, from: after, to: before })))

  /**
   * Whether trash record `item` holds a Wiki page that is back where it was deleted from by some other
   * way, such as an older App's undo: the page there carries the same version as the one the trash
   * keeps, generated regions and `updated` aside.
   */
  const returned = (item: TrashRecord): boolean => {
    if (item.kind !== 'page' || !existsSync(join(root, item.page)) || !existsSync(trashPage(item.id))) return false
    const version = (file: string) => JSON.stringify(pageVersion(readFileSync(file, 'utf8')))
    return version(join(root, item.page)) === version(trashPage(item.id))
  }

  /**
   * Writes `rows` as the trash and returns them, leaving out each Wiki page record whose page is back
   * (see returned), whose kept page it then removes. Throws, leaving the file as it stood, when it
   * cannot be written.
   */
  const saveTrash = (rows: TrashRecord[]): TrashRecord[] => {
    const back = rows.filter(returned)
    const kept = save('trash', rows.filter((item) => !back.includes(item)))
    for (const item of back) discard(item)
    return kept
  }

  /** Adds a record to trash with the most recently deleted item first. */
  const toTrash = (item: TrashRecord): void => {
    trash = saveTrash([item, ...trash])
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

  console.info(`vault ${root}: ${managed ? 'under' : 'not under'} git`)
  if (state.gitManaged !== managed) {
    note([
      { kind: 'text', text: '这个库' },
      { kind: 'strong', text: managed ? '在 git 管理之下' : '不在 git 管理之下' },
      { kind: 'text', text: '。' },
    ])
    saveState({ ...state, gitManaged: managed })
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
          text: `：${shared.map(([source, stems]) => `${source} → ${stems.join('、')}`).join('；')}。`
            + '这几页都列得出、改得动、删得掉，但它们指着同一份 PDF。',
        },
      ])
    }
    saveState({ ...state, sharedSources: shared.length })
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
      throw new Error(`原文内容散列前缀冲突：${upload.sourceId}`)
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
  /**
   * Records the fields `fill` names as the values the App last filled into paper `id`, each from the
   * service `sources` names for it, if any.
   */
  const recordFill = (id: string, fill: MetadataFill, sources: Record<string, string> = {}): void => {
    const held = fills.find((record) => record.paper === id)
    const fields = { ...held?.fields, ...fill }
    const named = {
      ...Object.fromEntries(Object.entries(held?.sources ?? {}).filter(([field]) => !(field in fill))),
      ...sources,
    }
    const next = { paper: id, fields, ...(Object.keys(named).length > 0 || held?.sources !== undefined ? { sources: named } : {}) }
    fills = save('metadata-fills', held === undefined
      ? [...fills, next]
      : fills.map((record) => (record === held ? { ...record, ...next } : record)))
  }

  /** What fillPaperPublication writes onto paper `id` for `publication`. Throws if there is no such paper. */
  const publicationFillOf = (id: string, publication: Publication | undefined): MetadataFill => {
    const paper = papers.get(id)
    if (!paper) throw new CallError('not-found', `论文不存在：${id}`)
    return publicationFill(paper, fills.find((record) => record.paper === id)?.fields, publication)
  }

  const fillPaper = (id: string, fill: MetadataFill, replaceTitle: string | null): string[] => {
    const paper = papers.get(id)
    if (!paper) throw new CallError('not-found', `论文不存在：${id}`)
    const write = missingMetadata(paper, fill, replaceTitle)
    const written = Object.keys(write)
    if (written.length === 0) return []
    writePaper(id, { ...write, updated: today() })
    recordFill(id, write)
    const filled = papers.get(id)!
    const source = sourceOf(id)
    later = save('later', later.map((entry) => (entry.paper === source
      ? laterWithMetadata(entry, filled, write.title !== undefined)
      : entry)))
    return written
  }

  /** Returns an inbox record even after it has left the visible inbox. */
  const downloadableEntry = (id: string): InboxRecord => {
    const entry = inbox.find((held) => held.id === id)
    if (!entry) throw new CallError('not-found', `收件里没有这一条：${id}`)
    if (pagesOf.has(entry.paper)) throw new CallError('refused', `这一条已经入库：${id}`)
    return entry
  }

  const projectDiscoveryProfile = (projectId: string) => {
    const project = projectOf(projectId)
    const discovered = inbox.filter((entry) => listedUnder(entry, 'discovery', projectId))
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
        project.name, ...projectTopics(served(project)), project.focus,
        ...(project.graph.activeNodes ?? []).flatMap((id) => {
          const node = project.graph.nodes.find((held) => held.id === id)
          return node === undefined ? [] : [node.label, node.nextAction ?? '']
        }),
      ].filter(Boolean).join(' · '),
      wikiTerms,
      projectPapers: linkedPapers.flatMap((paper) => {
        const seed = libraryArxivId(paper)
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
  /**
   * Reads project `projectId`'s discovery preferences `held`, as `state.json` stores them, key by key:
   * a key that is missing or cannot be read is reported on stderr and read as no preference.
   */
  const readDiscoveryPreferences = (projectId: string, held: unknown): DiscoveryPreferences => {
    const fields = (typeof held === 'object' && held !== null ? held : {}) as Record<string, unknown>
    const core = DiscoveryPreferencesRecordSchema.shape.coreIntentId.safeParse(fields['coreIntentId'])
    const disabled = DiscoveryPreferencesRecordSchema.shape.disabledIntentIds.safeParse(fields['disabledIntentIds'])
    for (const [key, read] of [['coreIntentId', core], ['disabledIntentIds', disabled]] as const) {
      if (!read.success) {
        console.error(`[vault] ${stateFile}: ${key} of project ${projectId} cannot be read by this version and reads as unset (the App may need an update): ${read.error.message}`)
      }
    }
    return { coreIntentId: core.data ?? null, disabledIntentIds: disabled.data ?? [] }
  }
  /** Each project's discovery preferences as read when the vault opened, then as last set. */
  const preferences = new Map(Object.entries(state.discoveryPreferences ?? {})
    .map(([projectId, held]) => [projectId, readDiscoveryPreferences(projectId, held)]))
  const discoveryPreferences = (projectId: string): DiscoveryPreferences => (
    preferences.get(projectId) ?? { coreIntentId: null, disabledIntentIds: [] }
  )
  /** Writes `changed` over project `projectId`'s discovery preferences in `state.json`. Throws when it cannot write. */
  const saveDiscoveryPreferences = (projectId: string, changed: Partial<DiscoveryPreferences>): void => {
    const held = discoveryPreferences(projectId)
    const stored = state.discoveryPreferences?.[projectId]
    // A key this change leaves alone keeps its stored value, even one this version cannot read.
    saveState({
      ...state,
      discoveryPreferences: {
        ...state.discoveryPreferences,
        [projectId]: { ...held, ...(typeof stored === 'object' && stored !== null ? stored : {}), ...changed },
      },
    })
    preferences.set(projectId, { ...held, ...changed })
  }
  /** The projects whose record in `discovery/directions.json` this version cannot read. */
  const unreadableDirections = new Set((lists.get('discovery/directions')?.unreadable ?? []).flatMap((record) => {
    const id = (record as { id?: unknown } | null)?.id
    return typeof id === 'string' ? [id] : []
  }))
  const heldDirections = (projectId: string): ProjectDirections | undefined => (
    directions.find((record) => record.id === projectId)
  )
  /**
   * Stores `next` as project `projectId`'s directions, and lists its candidates and declined
   * directions among the directions turned off, `disabled` when given, for Apps that derive directions
   * themselves. Throws when it cannot write.
   */
  const putDirections = (projectId: string, next: ProjectDirections, disabled = discoveryPreferences(projectId).disabledIntentIds): void => {
    const record = { id: projectId, ...next }
    directions = save('discovery/directions', directions.some((held) => held.id === projectId)
      ? directions.map((held) => (held.id === projectId ? record : held)) : [...directions, record])
    const mirrored = mirroredDisabled(next, disabled)
    if (mirrored.join('\n') !== discoveryPreferences(projectId).disabledIntentIds.join('\n')) {
      saveDiscoveryPreferences(projectId, { disabledIntentIds: mirrored })
    }
  }
  /** The fingerprint of the project fields its directions follow: topics, current goal and research path. */
  const directionBasisOf = (project: ProjectRecord): string => directionBasis({
    topics: projectTopics(served(project)),
    focus: project.focus,
    path: (project.graph.activeNodes ?? []).flatMap((id) => project.graph.nodes.find((node) => node.id === id)?.label ?? []),
  })
  /** The Wiki topics and short title of each of the project's papers that seeds discovery, by seed id. */
  const directionPapers = (project: ProjectRecord) => {
    const bySeed = new Map<string, DirectionPaper>(project.papers.flatMap((id) => {
      const paper = papers.get(id)
      const arxiv = libraryArxivId(paper)
      return paper === undefined || arxiv === null ? [] : [[`ARXIV:${arxiv}`, { topics: paper.topics, shortTitle: paper.shortTitle }] as const]
    }))
    return (paperId: string) => bySeed.get(paperId)
  }
  const projectDiscoveryIntents = (projectId: string) => directionIntents(
    heldDirections(projectId), discoveryPreferences(projectId), projectDiscoveryProfile(projectId),
  )

  /** Returns whether an inbox entry shows in the feed: it has not left, and the vault does not hold its paper. */
  const inFeed = (): ((entry: InboxRecord) => boolean) => {
    const owned = createPaperIndex<true>()
    for (const paper of papers.values()) owned.add(libraryIdentity(paper), true)
    return (entry) => !entry.gone && !pagesOf.has(entry.paper) && owned.find(entryIdentity(entry)) === undefined
  }

  /** What a found paper may turn out to be: in the vault, a live card, or delivered before. */
  const known = () => ({
    owned: [...papers.values()].map(libraryIdentity),
    live: inbox.filter((entry) => !entry.gone).map((entry) => ({ id: entry.id, identity: entryIdentity(entry) })),
    seen: [...inbox.filter((entry) => entry.gone).map(entryIdentity), ...delivered],
  })

  /** Returns `entry` with the score `ranking` gives its paper, or `entry` itself when that score is no news. */
  const rescored = (entry: InboxRecord, ranking: ScopeRanking): InboxRecord => {
    const score = ranking.scoreOf(batchIdOf(entry.semanticId, entry.arxiv))
    if (score === undefined || entry.ranking === undefined
      || (entry.ranking.relevance === score.relevance && entry.score?.path === score.path)) return entry
    return { ...entry, ranking: { ...entry.ranking, relevance: score.relevance }, score: { ...entry.score, path: score.path } }
  }

  /**
   * Delivers the papers a stream found that no stream delivered before, at most `limit` and each once,
   * as the records `make` builds, which `place` puts among the entries held; and lists the stream, by
   * `listed`, on each live card it found again. The scope's cards and these papers are cut by
   * `ranking` when given, which also rescores the cards it scored, else by recommendation score; a card
   * that misses the cut leaves this scope, and folds only when no other scope lists it.
   * Remembers what it delivered and returns those records. Papers the vault holds are skipped. Throws,
   * leaving the inbox as it stood, when it cannot write.
   */
  const deliver = <P extends RemotePaper & { semanticId?: string }>(
    scope: Pick<InboxStream, 'kind' | 'id'>, found: P[], limit: number | undefined,
    identityOf: (paper: P) => PaperIdentity, make: (paper: P) => InboxRecord,
    listed: (entry: InboxRecord, paper: P) => InboxRecord,
    place: (fresh: InboxRecord[], held: InboxRecord[]) => InboxRecord[],
    ranking?: ScopeRanking,
  ): InboxRecord[] => {
    const { fresh, merged } = sortFound(found, identityOf, known())
    let changed = false
    const shown = inFeed()
    const held = inbox.map((entry) => {
      const paper = merged.get(entry.id)
      const listing = paper === undefined ? entry : listed(entry, paper)
      const next = ranking !== undefined && shown(listing) && listedUnder(listing, scope.kind, scope.id)
        ? rescored(listing, ranking) : listing
      if (next !== entry) changed = true
      return next
    })
    const live = held.filter((entry) => shown(entry) && listedUnder(entry, scope.kind, scope.id))
    const capped = limit === undefined ? fresh : fresh.slice(0, limit)
    const { kept, folded } = ranking === undefined
      ? cutBelow(live, capped, ops.deliverySettings().maxShownPerScope ?? DEFAULT_DELIVERY_SETTINGS.maxShownPerScope)
      : cutByRanking(
        live.map((entry) => ({ id: entry.id, paperId: batchIdOf(entry.semanticId, entry.arxiv), ranking: entry.ranking })),
        capped, (paper) => batchIdOf(paper.semanticId, paper.id), ranking,
      )
    const added = kept.map(make)
    if (added.length === 0 && !changed && folded.size === 0) return []
    // A card another scope still lists leaves only this scope; it folds once no scope lists it.
    const fold = (entry: InboxRecord): InboxRecord => (!folded.has(entry.id) ? entry
      : withoutStreams(entry, (stream) => stream.kind === scope.kind && stream.id === scope.id)
        ?? { ...entry, gone: true, left: 'folded' })
    inbox = save('inbox', place(added, held.map(fold)))
    remember(added)
    return added
  }

  // An older version derived every project's directions on each read and fetched them; they become
  // its confirmed directions, so a project created from now on starts with candidates instead.
  if (!directionsStored) {
    directions = save('discovery/directions', [...projectById.values()].map((project) => ({
      id: project.id,
      ...migratedDirections(
        clusterRecommendationProfile(projectDiscoveryProfile(project.id)), directionBasisOf(project), directionPapers(project),
      ),
    })))
  }

  const ops: VaultOps = {
    today,

    listPapers(params) {
      if (params.facet) checkGroupKey(params.facet.field, heldColumns())
      for (const { field } of params.filters ?? []) checkGroupKey(field, heldColumns())
      const { rows, total } = listPapers(linkedRows(), params)
      return { rows: rows.map((row) => structuredClone(row)), total }
    },

    facetPapers(field, filter, filters = []) {
      checkGroupKey(field, heldColumns())
      for (const held of filters) checkGroupKey(held.field, heldColumns())
      return facetPapers(linkedRows(), field, filter, filters)
    },

    getPaper(id) {
      const paper = papers.get(id)
      if (!paper) throw new CallError('not-found', `论文不存在：${id}`)
      return structuredClone(withProjectLinks(paper, projects()))
    },

    hasPaper(id) {
      return papers.has(id)
    },

    updatePaper: atomic((id, patch) => {
      const paper = papers.get(id)
      if (!paper) throw new CallError('not-found', `论文不存在：${id}`)
      if (patch.topics !== undefined) throw new CallError('refused', '这一页的主题由归属决定，改归属')
      const { custom, ...fields } = patch
      if (custom !== undefined) checkCustom(heldColumns(), custom, paper.custom)
      writePaper(id, {
        ...fields,
        ...(custom === undefined ? {} : { custom: patchedCustom(paper.custom, custom) }),
        updated: today(),
      })
      if (patch.title !== undefined || patch.shortTitle !== undefined) {
        const fresh = papers.get(id)!
        chats = save('chats', chats.map((session) => (session.paperId === id
          ? { ...session, title: fresh.title }
          : session)))
      }
    }),

    paperSnapshot(id) {
      if (!papers.has(id)) throw new CallError('not-found', `论文不存在：${id}`)
      return snapshotOf(readPage(paperFile(id)).front)
    },

    putPaper: atomic((id, snapshot) => {
      if (!papers.has(id)) throw new CallError('not-found', `论文不存在：${id}`)
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
      chats = save('chats', chats.map((session) => (session.paperId === id
        ? { ...session, title: restored.title }
        : session)))
    }),

    deletePaper: atomic((id) => {
      const paper = papers.get(id)
      if (!paper) throw new CallError('not-found', `论文不存在：${id}`)
      const entry = nextId('trash')
      const source = sourceOf(id)
      const reading = readings.find((held) => held.paperId === id)
      // Sources are immutable: remove only the wiki page and leave the PDF under sources for restoration.
      movePage(paperFile(id), trashPage(entry))
      unindexPaper(id, source)
      refreshWikiPage(id, null)
      if (reading !== undefined) {
        readings = save('paper-readings', readings.filter((held) => held !== reading))
      }
      toTrash({
        id: entry, kind: 'paper', title: paper.title, deletedAt: nowMs(),
        page: `wiki/papers/${id}.md`,
        ...(reading === undefined ? {} : { reading }),
      })
    }),

    paperSource(id) {
      if (!papers.has(id)) throw new CallError('not-found', `论文不存在：${id}`)
      const file = pdfOf(id)
      if (!file) throw new CallError('not-found', `库里没有这一篇的原文：${id}`)
      return new Uint8Array(readFileSync(join(root, 'sources', 'papers', file)))
    },

    importPaper: atomic(storeUpload),

    fillPaperMetadata: atomic(fillPaper),

    fillPaperPublication: atomic((id, publication) => {
      const write = publicationFillOf(id, publication)
      if (Object.keys(write).length === 0) return []
      writePaper(id, { ...write, updated: today() })
      recordFill(id, write, write.venue === undefined ? {} : { venue: publication?.source ?? 'semantic-scholar' })
      return Object.keys(write)
    }),

    publicationFillOf,

    paperReading(id) {
      if (!papers.has(id)) throw new CallError('not-found', `论文不存在：${id}`)
      return readingOf(id)
    },

    mutatePaperReading(id, mutation: ReadingMutation) {
      if (!papers.has(id)) throw new CallError('not-found', `论文不存在：${id}`)
      const next = applyReadingMutation(readingOf(id), mutation, nextId, today())
      storeReading(id, next)
      return structuredClone(next)
    },

    putPaperReading(id, reading) {
      if (!papers.has(id)) throw new CallError('not-found', `论文不存在：${id}`)
      storeReading(id, structuredClone(reading))
    },

    paperColumns() {
      return structuredClone(heldColumns())
    },

    setPaperColumns(columns) {
      checkColumns(columns, [...papers.values()])
      saveState({ ...state, columns: structuredClone(columns) })
    },

    renamePaperOption: atomic((key, from, to) => {
      const held = heldColumns()
      const options = renamedOptions(held, key, from, to)
      const day = today()
      // Writing a page replaces its `papers` entry, so capture every target row before any write.
      for (const row of [...papers.values()]) {
        const cell = renamedCell(row, key, from, to)
        if (cell === undefined) continue
        writePaper(row.id, { custom: { ...row.custom, [key]: cell }, updated: day })
      }
      saveState({
        ...state,
        columns: {
          ...held,
          custom: held.custom.map((c) => (c.key === key ? { ...c, options } : c)),
        },
      })
    }),

    setPaperColumnType: atomic((key, type) => {
      const { columns: next, cells } = retypedColumn(heldColumns(), [...papers.values()], key, type)
      const day = today()
      // Writing a page replaces its `papers` entry, so refetch each row by ID immediately before writing it.
      for (const [id, cell] of cells) {
        writePaper(id, { custom: patchedCustom(papers.get(id)!.custom, { [key]: cell ?? null }), updated: day })
      }
      saveState({ ...state, columns: next })
    }),

    paperCells(key) {
      return structuredClone(columnCells([...papers.values()], key))
    },

    putPaperColumn: atomic((column, groupAt, cells) => {
      const { columns: next, cells: changed } = restoredColumn(
        heldColumns(), [...papers.values()], column, groupAt, cells)
      const day = today()
      for (const [id, cell] of changed) {
        writePaper(id, {
          custom: patchedCustom(papers.get(id)!.custom, { [column.key]: cell ?? null }), updated: day,
        })
      }
      saveState({ ...state, columns: next })
    }),

    listProjects() {
      return applyOrder(projects(), state.projectOrder, (p) => p.id).map((p) => {
        const workspace = readLocalProjectWorkspace(p)
        const graph = workspace?.graph ?? p.graph
        const records = [...p.events, ...workspace?.events ?? []]
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          priority: p.priority,
          ...listedTopics(p),
          focus: p.focus,
          ...(p.block === undefined ? {} : { block: p.block }),
          ...(p.conflictPage === undefined ? {} : { conflictPage: p.conflictPage }),
          control: projectControlState({
            tasks: p.tasks,
            ...(p.block === undefined ? {} : { block: p.block }),
            activeNodes: overviewResearch(graph).activeNodes,
          }),
          conclusions: conclusionCounts(conclusionsOf(p, graph)),
          paperCount: p.papers.filter((id) => papers.has(id)).length,
          milestones: p.milestones.map(({ date, done }) => ({ date, done })),
          recentEvents: sortRecordsNewestFirst(records).slice(0, RECENT_EVENTS).reverse()
            .map(({ date, text, origin }) => ({ date, text, ...(origin === undefined ? {} : { origin }) })),
          ...lastProgressOf(changes, p.id, records),
        }
      })
    },

    reorderProjects(order) {
      const known = new Set(projectById.keys())
      saveState({ ...state, projectOrder: [...order].filter((id) => known.has(id)) })
    },

    overviewProjects() {
      return applyOrder(projects(), state.projectOrder, (p) => p.id).map((p) => {
        // Overview never initiates SSH; reading graph and events from a local workspace is cheap enough to match the project page.
        const workspace = readLocalProjectWorkspace(p)
        const graph = workspace?.graph ?? p.graph
        const events = [...p.events, ...(workspace?.events ?? [])]
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          priority: p.priority,
          ...listedTopics(p),
          focus: p.focus,
          ...(p.block === undefined ? {} : { block: p.block }),
          start: p.start,
          due: p.due,
          conclusions: conclusionCounts(conclusionsOf(p, graph)),
          tasks: p.tasks.map((task) => ({
            ...task,
            ...(task.window === undefined ? {} : { window: { ...task.window } }),
          })),
          milestones: p.milestones.map((m) => ({ ...m })),
          events: events.map((e) => ({ ...e })),
          ...lastProgressOf(changes, p.id, events),
          research: overviewResearch(graph),
        }
      })
    },

    createProject: atomic((name) => {
      const start = today()
      const project: ProjectRecord = {
        id: nextId('project'),
        created: start,
        name,
        status: ACTIVE_PROJECT,
        priority: 'p1',
        topic: DEFAULT_PROJECT_TOPIC,
        focus: '定义第一步',
        start,
        due: new Date(Date.parse(`${start}T00:00:00Z`) + NEW_PROJECT_SPAN_DAYS * 86_400_000)
          .toISOString().slice(0, 10),
        memo: '',
        conclusionList: [],
        papers: [],
        tasks: [],
        milestones: [],
        events: [{ date: start, text: '创建项目', kind: 'project' as const }],
        relations: [],
        attachments: [],
        graph: { nodes: [], edges: [] },
        agentSessions: [],
      }
      writePage(projectFile(project.id), projectPageText(project), staging)
      projectById.set(project.id, project)
      // Front of whatever order already exists, so a new project outranks the manual order too.
      saveState({ ...state, projectOrder: [project.id, ...(state.projectOrder ?? [])] })
      return project.id
    }),

    pinProjectTopics() {
      const unpinned = (project: ProjectRecord) => {
        const pins = topicPinsOf(project, topicPages(wikiData))
        return {
          pins,
          changed: pins.some(({ page }) => page === null)
            || JSON.stringify(pins.map(({ page, title }) => ({ page, title }))) !== JSON.stringify(project.topicPins ?? []),
        }
      }
      const pending = projects().filter((project) => unpinned(project).changed)
      const titles = pending.flatMap((project) => unpinned(project).pins.filter(({ page }) => page === null).map(({ title }) => title))
      const nameable = titles.filter((title) => slugOf(title) !== '')
      for (const title of titles.filter((held) => slugOf(held) === '')) {
        console.error(`[project] 主题「${title}」没有字母或数字，建不了主题页，留作只有名字的主题`)
      }
      const before = new Set(wikiCards(wikiData).map((card) => card.id))
      try {
        fileTopics(nameable)
      } catch (err) {
        console.error(`[project] 项目的主题建不了主题页，留作只有名字的主题：${err instanceof Error ? err.message : String(err)}`)
      }
      const written = pending.flatMap((project) => {
        const pins = unpinned(project).pins.flatMap(({ page, title }) => (page === null ? [] : [{ page, title }]))
        if (JSON.stringify(pins) === JSON.stringify(project.topicPins ?? [])) return []
        // A workspace never holds the pins, so pinning leaves bound workspaces as they are.
        landProject({ ...project, topicPins: pins.length === 0 ? undefined : pins }, ['topicPins'], false)
        return [project.id]
      })
      return { pages: wikiCards(wikiData).map((card) => card.id).filter((id) => !before.has(id)), projects: written }
    },

    putProject(project) {
      const held = projectOf(project.id)
      const titles = projectTopics(project)
      const index = topicPages(wikiData)
      const chosen = project.topicPages === undefined
        ? titledTopics(titles, index)
        : titles.map((title, at) => ({ title, page: project.topicPages![at] ?? null }))
      const fields = Object.fromEntries(PROJECT_FIELDS.map((key) => [key, project[key]]))
      return writeProject({ ...held, ...fields, ...storedTopics(chosen, held, index) }, [...PROJECT_FIELDS, 'topicPins']).then(() => {})
    },

    getProject(id) {
      return detailOf(shownProject(id))
    },

    heldProject(id) {
      const project = shownProject(id)
      return detailWith(project, project.workspaceSsh === undefined ? readLocalProjectWorkspace(project) : remoteRead.get(id))
    },

    hasProject(id) {
      return projectById.has(id)
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
      return writeProjectWorkspaceState(next, ideas).then(() => {
        const current = projectOf(id)
        const bound: ProjectRecord = { ...current }
        delete bound.workspaceRoot
        delete bound.workspaceSsh
        if (next.workspaceRoot !== undefined) bound.workspaceRoot = next.workspaceRoot
        if (next.workspaceSsh !== undefined) bound.workspaceSsh = next.workspaceSsh
        // A write that landed while the workspace was connected is synced again with the binding.
        return writeProject(bound, ['workspaceRoot', 'workspaceSsh'], current !== project)
      })
    },

    updateProject(id, patch) {
      const { block, topics, ...fields } = patch
      const next: ProjectRecord = { ...projectOf(id), ...fields }
      if (block === null) delete next.block
      if (typeof block === 'string') next.block = block
      // The contract guarantees fixed-width ISO dates, so lexical order is chronological order.
      if (next.due < next.start) throw new CallError('invalid', `项目截止日期早于开始日期：${next.start} – ${next.due}`)
      if (topics !== undefined) {
        fileTopics(topics)
        Object.assign(next, storedTopics(titledTopics(topics, topicPages(wikiData)), next, topicPages(wikiData)))
      }
      return writeProject(next, [...Object.keys(patch), ...(topics === undefined ? [] : ['topic', 'topicPins'])] as (keyof ProjectRecord)[])
    },

    deleteProject: atomic((id) => {
      const project = projectOf(id)
      const entry = nextId('trash')
      movePage(projectFile(id), trashPage(entry))
      projectById.delete(id)
      dropStreams((stream) => stream.kind === 'discovery' && stream.id === id)
      toTrash({
        id: entry, kind: 'project', title: project.name, deletedAt: nowMs(),
        page: `wiki/${PROJECTS_DIR}/${id}.md`,
      })
    }),

    createTask(projectId, task, origin) {
      return detailOf(addTask(projectId, task, origin))
    },

    agentTaskRequests(projectId) {
      return projects().filter((project) => projectId === undefined || project.id === projectId).flatMap((project) => {
        const taken = project.agentTasks ?? {}
        return readWorkspaceAgentTasks(project.workspaceRoot)
          .filter((request) => taken[request.id] === undefined)
          .map((request) => ({ project: project.id, request }))
      })
    },

    addAgentTask: atomic((projectId, request) => {
      const had = new Set(projectOf(projectId).tasks.map((task) => task.id))
      const project = addTask(projectId, {
        title: request.title, start: request.date, end: request.date, state: 'plan', priority: 'p1',
        ...(request.note === undefined ? {} : { note: request.note }),
      }, 'agent')
      const task = project.tasks.find((candidate) => !had.has(candidate.id))!.id
      return writeProject({ ...project, agentTasks: { ...project.agentTasks, [request.id]: task } }, ['agentTasks'])
    }),

    updateTask(projectId, taskId, patch) {
      const project = projectOf(projectId)
      const task = project.tasks.find((t) => t.id === taskId)
      if (!task) throw new CallError('not-found', `任务不存在：${taskId}`)
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
      if (!project.tasks.some((t) => t.id === taskId)) throw new CallError('not-found', `任务不存在：${taskId}`)
      return writeProject(
        { ...project, tasks: project.tasks.filter((t) => t.id !== taskId) }, ['tasks'],
      )
    },

    reorderTasks(projectId, order) {
      const project = projectOf(projectId)
      const byId = new Map(project.tasks.map((t) => [t.id, t]))
      if (order.length !== project.tasks.length || !order.every((id) => byId.has(id))) {
        throw new CallError('changed', '任务顺序与项目任务不匹配')
      }
      return writeProject({ ...project, tasks: order.map((id) => byId.get(id)!) }, ['tasks'])
    },

    async setTaskNode(projectId, taskId, nodeId) {
      const graphs = await readWorkspaceGraphs([projectId])
      const project = projectOf(projectId)
      if (!project.tasks.some((t) => t.id === taskId)) throw new CallError('not-found', `任务不存在：${taskId}`)
      const graph = workspaceGraph(project, graphs) ?? project.graph
      if (nodeId !== null && !graph.nodes.some((n) => n.id === nodeId)) throw new CallError('not-found', `节点不存在：${nodeId}`)
      const taskNodes = Object.fromEntries(Object.entries(project.taskNodes ?? {}).filter(([task]) => task !== taskId))
      if (nodeId !== null) taskNodes[taskId] = nodeId
      const next: ProjectRecord = { ...project, taskNodes }
      if (Object.keys(taskNodes).length === 0) delete next.taskNodes
      return writeProject(next, ['taskNodes'])
    },

    createMilestone(projectId, milestone) {
      const project = projectOf(projectId)
      return writeProject(
        { ...project, milestones: [{ ...milestone, id: nextId('ms') }, ...project.milestones] },
        ['milestones'],
      )
    },

    updateMilestone(projectId, milestoneId, patch) {
      const project = projectOf(projectId)
      const milestone = project.milestones.find((m) => m.id === milestoneId)
      if (!milestone) throw new CallError('not-found', `里程碑不存在：${milestoneId}`)
      const next = { ...milestone, ...patch }
      return writeProject({
        ...project,
        milestones: project.milestones.map((m) => (m.id === milestoneId ? next : m)),
      }, ['milestones'])
    },

    deleteMilestone(projectId, milestoneId) {
      const project = projectOf(projectId)
      if (!project.milestones.some((m) => m.id === milestoneId)) {
        throw new CallError('not-found', `里程碑不存在：${milestoneId}`)
      }
      return writeProject({
        ...project,
        milestones: project.milestones.filter((m) => m.id !== milestoneId),
      }, ['milestones'])
    },

    createRelation(projectId, { group, ...fields }) {
      const project = projectOf(projectId)
      const checked = relationFields(fields)
      const item = { id: nextId('rel'), ...checked }
      const seen = project.relations.some((r) => r.group === group)
      return writeProject({
        ...project,
        relations: seen
          ? project.relations.map((r) => (r.group === group ? { ...r, items: [item, ...r.items] } : r))
          : [...project.relations, { group, items: [item] }],
      }, ['relations'])
    },

    deleteRelation(projectId, relationId) {
      const project = projectOf(projectId)
      if (!project.relations.some((r) => r.items.some((i) => i.id === relationId))) {
        throw new CallError('not-found', `关联不存在：${relationId}`)
      }
      return writeProject({
        ...project,
        relations: project.relations.map((r) =>
          ({ ...r, items: r.items.filter((i) => i.id !== relationId) })),
      }, ['relations'])
    },

    updateRelation(projectId, relationId, relation) {
      const project = projectOf(projectId)
      if (!project.relations.some((r) => r.items.some((i) => i.id === relationId))) {
        throw new CallError('not-found', `关联不存在：${relationId}`)
      }
      const item = { id: relationId, ...relationFields(relation) }
      return writeProject({
        ...project,
        relations: project.relations.map((r) =>
          ({ ...r, items: r.items.map((i) => (i.id === relationId ? item : i)) })),
      }, ['relations'])
    },

    addPaper(projectId, paperId) {
      const project = projectOf(projectId)
      if (!papers.has(paperId)) throw new CallError('not-found', `论文不存在：${paperId}`)
      if (project.papers.includes(paperId)) throw new CallError('refused', `已经关联过这篇论文：${paperId}`)
      return writeProject({ ...project, papers: [paperId, ...project.papers] }, ['papers'])
    },

    removePaper(projectId, paperId) {
      const project = projectOf(projectId)
      if (!project.papers.includes(paperId)) throw new CallError('not-found', `项目没有关联这篇论文：${paperId}`)
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
      if (group === undefined) throw new CallError('not-found', `关联不存在：${id}`)
      const relations = project.relations.map((r) => (r !== group
        ? r
        : { ...r, items: moved(r.items, r.items.findIndex((i) => i.id === id)) }))
      return writeProject({ ...project, relations }, ['relations'])
    },

    createAttachment(projectId, attachment) {
      if (!isAbsolute(attachment.path)) throw new CallError('invalid', `附件路径不是绝对路径：${attachment.path}`)
      const project = projectOf(projectId)
      return writeProject({
        ...project,
        attachments: [{ ...attachment, id: nextId('att') }, ...project.attachments],
      }, ['attachments'])
    },

    deleteAttachment: atomic((projectId, attachmentId) => {
      const project = projectOf(projectId)
      const position = project.attachments.findIndex((a) => a.id === attachmentId)
      const attachment = project.attachments[position]
      if (!attachment) throw new CallError('not-found', `附件不存在：${attachmentId}`)
      const next = writeProject({
        ...project,
        attachments: project.attachments.filter((a) => a.id !== attachmentId),
      }, ['attachments'])
      toTrash({
        id: nextId('trash'), kind: 'attachment', title: attachment.name, deletedAt: nowMs(),
        projectId, attachment, position,
      })
      return next
    }),

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
        throw new CallError('not-found', `节点不存在：${nodeId}`)
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

    deleteNode: atomic((projectId, nodeId) => {
      const project = projectOf(projectId)
      if (!project.graph.nodes.some((node) => node.id === nodeId)) {
        throw new CallError('not-found', `节点不存在：${nodeId}`)
      }
      const nextProject = writeProject({
        ...project,
        graph: {
          nodes: project.graph.nodes.filter((node) => node.id !== nodeId),
          edges: project.graph.edges.filter(([from, to]) => from !== nodeId && to !== nodeId),
        },
      }, ['graph'])
      const day = today()
      ideas = save('ideas', ideas.map((idea) => (
        idea.project === projectId && idea.node === nodeId
          ? updateResearchIdea(idea, { node: null }, day)
          : idea
      )))
      const updatedProject = projectById.get(projectId)
      if (updatedProject !== undefined) syncProjectWorkspace(updatedProject)
      return nextProject
    }),

    createConclusion(projectId, text, { chat, paper }) {
      const project = projectOf(projectId)
      const source = chat === undefined ? MANUAL_SOURCE : chatSource(chatOf(chat).title)
      if (paper !== undefined && !papers.has(paper)) throw new CallError('not-found', `论文不存在：${paper}`)
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
        throw new CallError('not-found', `结论不存在：${conclusionId}`)
      }
      return writeProject({
        ...project,
        conclusionList: project.conclusionList.map((conclusion) => (
          conclusion.id === conclusionId ? { ...conclusion, state } : conclusion
        )),
      }, ['conclusionList'])
    },

    verifyConclusion(projectId, node, fingerprint, graphs = NO_WORKSPACE_GRAPHS) {
      const project = projectOf(projectId)
      const held = concludedNodes(workspaceGraph(project, graphs) ?? project.graph).find((n) => n.id === node)
      if (held === undefined) throw new CallError('not-found', `节点没有可验证的结论：${node}`)
      if (conclusionFingerprint(held) !== fingerprint) throw new CallError('changed', CONCLUSION_CHANGED)
      const entry = { node, fingerprint, date: today() }
      return writeProject({
        ...project,
        verifiedConclusions: [...(project.verifiedConclusions ?? []).filter((v) => v.node !== node), entry],
      }, ['verifiedConclusions'], false)
    },

    unverifyConclusion(projectId, node) {
      const project = projectOf(projectId)
      const rest = (project.verifiedConclusions ?? []).filter((v) => v.node !== node)
      const next = { ...project }
      if (rest.length === 0) delete next.verifiedConclusions
      else next.verifiedConclusions = rest
      return writeProject(next, ['verifiedConclusions'], false)
    },

    deleteConclusion(projectId, conclusionId) {
      const project = projectOf(projectId)
      if (!project.conclusionList.some((conclusion) => conclusion.id === conclusionId)) {
        throw new CallError('not-found', `结论不存在：${conclusionId}`)
      }
      return writeProject({
        ...project,
        conclusionList: project.conclusionList.filter((conclusion) => conclusion.id !== conclusionId),
      }, ['conclusionList'])
    },

    listInbox(params = {}) {
      const rows = inbox.filter(inFeed())
        .filter((e) => params.kind === undefined || listedUnder(e, params.kind))
        .filter((e) => params.project === undefined || listedUnder(e, 'discovery', params.project))
        .filter((e) => params.watch === undefined || listedUnder(e, 'watch', params.watch))
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
        reasons: structuredClone(combinedReasons(e)),
        ...(e.also === undefined ? {} : { also: e.also.map(({ kind, id, source }) => ({ kind, id, source })) }),
        ...(e.feedback === undefined ? {} : { feedback: e.feedback }),
        downloaded: pagesOf.has(e.paper),
        paper: paperOf(e.paper),
        pdf: e.pdf,
        ...(e.ranking === undefined ? {} : { ranking: structuredClone(e.ranking) }),
      }))
      return orderListing(rows, params)
    },

    dismissInbox: atomic((id) => {
      const entry = liveEntry(id)
      leaveEntry(id, 'dismissed')
      toTrash({
        id: nextId('trash'), kind: 'inbox', title: entry.title, deletedAt: nowMs(), entryId: id,
      })
    }),

    readLater: atomic((id) => {
      const entry = liveEntry(id)
      leaveEntry(id, 'later')
      if (later.some((x) => x.id === id)) return false
      later = save('later', [{
        id: entry.id,
        title: entry.title,
        source: entry.source,
        added: today(),
        authors: entry.authors,
        venue: entry.venue,
        abstract: entry.abstract,
        paper: entry.paper,
        pdf: entry.pdf,
      }, ...later])
      return true
    }),

    prepareInboxDownload(id) {
      const entry = downloadableEntry(id)
      const known = [...papers.values()].find((paper) => paper.identifier === `arXiv:${entry.arxiv}`)?.id
      if (known !== undefined) return { kind: 'existing', paper: known, title: papers.get(known)!.title }
      if (entry.pdf === '') throw new CallError('refused', '这一条没有原文地址')
      return { kind: 'fetch', url: entry.pdf }
    },

    completeInboxDownload: atomic((id, bytes, pageCount) => {
      const entry = downloadableEntry(id)
      const topics = entry.topic === '' ? null : topicDir(wikiHome(wikiData))
      const result = storeUpload(`${entry.title}.pdf`, bytes)
      const source = sourceOf(result.paper.id)
      leaveEntry(id, 'library', { downloaded: true, paper: source })
      later = save('later', later.map((queued) => (queued.id === id ? { ...queued, paper: source } : queued)))
      if (result.kind === 'existing') {
        return { kind: 'existing', paper: result.paper.id, title: result.paper.title }
      }
      fillPaper(result.paper.id, { ...remoteMetadata({
        id: entry.arxiv,
        title: entry.title,
        abstract: entry.abstract,
        ...entry.meta,
      }), ...(pageCount === undefined ? {} : { pageCount }) }, null)
      const filing = topics === null ? null : topicProposal(
        result.paper.id,
        entry.title,
        [],
        [entry.topic],
        wikiCards(wikiData),
        topics,
      )
      if (filing !== null) ops.applyProposal(filing)
      return { kind: 'added', paper: result.paper.id }
    }),

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

    removeLater: atomic((id) => {
      const position = later.findIndex((x) => x.id === id)
      if (position < 0) throw new CallError('not-found', `稍后阅读里没有这一条：${id}`)
      const removed = later[position]!
      later = save('later', later.filter((x) => x.id !== id))
      toTrash({
        id: nextId('trash'), kind: 'later', title: removed.title, deletedAt: nowMs(), later: removed, position,
      })
    }),

    listWatches() {
      return watches.map((w) => structuredClone(w))
    },

    createWatch(watch) {
      watches = save('watches', [{ id: nextId('watch'), ...structuredClone(watch), active: true }, ...watches])
    },

    updateWatch(id, watch) {
      const current = watches.find((item) => item.id === id)
      if (current === undefined) throw new CallError('not-found', `关注不存在：${id}`)
      if (current.type !== watch.type) throw new CallError('invalid', '不能把主题关注改成作者关注，或把作者关注改成主题关注')
      watches = save('watches', watches.map((item) => (
        item.id === id ? { id, ...structuredClone(watch), active: item.active } as typeof item : item
      )))
    },

    setWatchActive(id, active) {
      if (!watches.some((w) => w.id === id)) throw new CallError('not-found', `关注不存在：${id}`)
      watches = save('watches', watches.map((w) => (w.id === id ? { ...w, active } : w)))
    },

    deleteWatch: atomic((id) => {
      if (!watches.some((w) => w.id === id)) throw new CallError('not-found', `关注不存在：${id}`)
      watches = save('watches', watches.filter((w) => w.id !== id))
      dropStreams((stream) => stream.kind === 'watch' && stream.id === id)
    }),

    deliverySettings() {
      const held = state.deliverySettings
      return {
        maxItemsPerRun: held?.maxItemsPerRun ?? DEFAULT_DELIVERY_SETTINGS.maxItemsPerRun,
        maxShownPerScope: state.maxShownPerScope ?? held?.maxShownPerScope ?? DEFAULT_DELIVERY_SETTINGS.maxShownPerScope,
      }
    },

    setDeliverySettings(settings: DeliverySettings) {
      const next: VaultState = { ...state, deliverySettings: { maxItemsPerRun: settings.maxItemsPerRun } }
      if (settings.maxShownPerScope === undefined) delete next.maxShownPerScope
      else next.maxShownPerScope = settings.maxShownPerScope
      saveState(next)
    },

    addInboxEntries: atomic((watchId, found, limit, ranking) => {
      const watch = watches.find((w) => w.id === watchId)
      if (!watch) throw new CallError('not-found', `关注不存在：${watchId}`)
      const added = deliver({ kind: 'watch', id: watch.id }, found, limit, (paper) => paperIdentity({
        arxiv: paper.id, ...doiField(paper), title: paper.title, submitted: paper.submitted,
      }), (paper) => {
        const record: InboxRecord = {
          id: nextId('inbox'), watch: watch.id, downloaded: false, paper: '', gone: false,
          semanticId: '', ...doiField(paper),
          ...inboxFields(watch, paper),
        }
        return ranking === undefined ? record : rescored(record, ranking)
      }, (entry, paper) => {
        const fields = inboxFields(watch, paper)
        return withStream(entry, { kind: 'watch', id: watch.id, source: fields.source, reasons: fields.reasons })
      }, (fresh, held) => {
        const at = held.findIndex((entry) => entry.watch === watch.id)
        return at < 0 ? [...held, ...fresh] : [...held.slice(0, at), ...fresh, ...held.slice(at)]
      }, ranking)
      return added.map((entry) => entry.arxiv)
    }),

    undelivered(found) {
      return sortFound(found, (paper) => paperIdentity({
        arxiv: paper.id, ...doiField(paper), ...(paper.semanticId === undefined ? {} : { semanticId: paper.semanticId }),
        title: paper.title, submitted: paper.submitted,
      }), known()).fresh
    },

    updateInboxEntries(watchId, found) {
      const byArxiv = new Map(found.map((paper) => [paper.id, paper]))
      let updated = 0
      const next = inbox.map((entry) => {
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
      if (updated > 0) inbox = save('inbox', next)
      return updated
    },

    listDiscoveryProfiles() {
      return [...projectById.values()].filter((project) => project.status === ACTIVE_PROJECT)
        .map((project) => {
          const profile = projectDiscoveryProfile(project.id)
          const seeds = recommendationSeedIds(profile)
          const base = project.papers.filter((id) => libraryArxivId(papers.get(id)) !== null).length
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
            candidates: (heldDirections(project.id)?.candidates ?? []).map((candidate) => ({
              id: candidate.id, label: candidate.label, seedCount: candidate.seeds.length,
              seeds: candidate.seeds.map((seed) => ({ id: seed.paperId, title: seed.title })),
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
      saveState({
        ...state,
        discoverySchedules: { ...state.discoverySchedules, [projectId]: schedule },
      })
    },

    refreshProgress(scope) {
      scopeOf(scope)
      const held = progress.find((row) => row.id === `${scope.kind}:${scope.id}`)
      return {
        steps: { ...held?.steps }, candidates: structuredClone(held?.candidates ?? []),
        favouredAt: held?.favouredAt ?? null, newest: [...held?.newest ?? []], poolStalled: held?.poolStalled === true,
      }
    },

    setRefreshProgress(scope, next) {
      scopeOf(scope)
      const id = `${scope.kind}:${scope.id}`
      const gone = (row: RefreshProgressRecord): boolean => {
        const [, kind, held] = /^(project|watch):(.*)$/.exec(row.id) ?? []
        if (kind === 'project') return !projectById.has(held!) && !unreadableProjects.has(held!)
        return kind === 'watch' && !watches.some((watch) => watch.id === held)
          && !(lists.get('watches')?.unreadable ?? []).some((watch) => (watch as { id?: unknown }).id === held)
      }
      const record: RefreshProgressRecord = {
        id, steps: { ...next.steps }, candidates: structuredClone(next.candidates),
        ...(next.favouredAt === null ? {} : { favouredAt: next.favouredAt }),
        ...(next.newest.length === 0 ? {} : { newest: [...next.newest] }),
        ...(next.poolStalled ? { poolStalled: true } : {}),
      }
      progress = save('discovery/progress', [...progress.filter((row) => row.id !== id && !gone(row)), record])
    },

    scopeSignals(scope) {
      scopeOf(scope)
      const kind = scope.kind === 'project' ? 'discovery' : 'watch'
      const shown = inFeed()
      const ownedArxiv = new Set([...papers.values()].flatMap((paper) => libraryArxivId(paper) ?? []))
      const cards = inbox.flatMap((entry) => {
        const stream = streamsOf(entry).find((held) => held.kind === kind && held.id === scope.id)
        if (stream === undefined) return []
        const rating = entry.paper === '' ? undefined : papers.get(paperOf(entry.paper))?.rating
        return [{
          paperIds: [...entry.semanticId === '' ? [] : [entry.semanticId], ...entry.arxiv === '' ? [] : [`ARXIV:${entry.arxiv}`]],
          gone: entry.gone,
          downloaded: entry.downloaded,
          ...(entry.left === undefined ? {} : { left: entry.left }),
          ...(entry.feedback === undefined ? {} : { feedback: entry.feedback }),
          reasons: stream.reasons.map(({ kind: reason, label }) => ({ kind: reason, label })),
          ...(rating === undefined ? {} : { rating }),
          ...(entry.score === undefined ? {} : { path: entry.score.path }),
          shown: shown(entry),
          owned: pagesOf.has(entry.paper) || ownedArxiv.has(entry.arxiv),
        }]
      })
      const linked = scope.kind === 'project' ? projectOf(scope.id).papers : []
      return {
        cards,
        ratings: Object.fromEntries(linked.flatMap((id) => {
          const paper = papers.get(id)
          const arxiv = libraryArxivId(paper)
          return paper?.rating === undefined || arxiv === null ? [] : [[`ARXIV:${arxiv}`, paper.rating]]
        })),
      }
    },

    setDiscoveryIntent(projectId, intentId, action) {
      projectOf(projectId)
      if (!projectDiscoveryIntents(projectId).some((intent) => intent.id === intentId)) {
        throw new CallError('not-found', `推荐方向不存在：${intentId}`)
      }
      const disabled = new Set(discoveryPreferences(projectId).disabledIntentIds)
      if (action === 'disable') disabled.add(intentId)
      else disabled.delete(intentId)
      saveDiscoveryPreferences(projectId, action === 'set-core'
        ? { coreIntentId: intentId, disabledIntentIds: [...disabled] }
        : { disabledIntentIds: [...disabled] })
    },

    scanDiscoveryDirections: atomic((projectId) => {
      const project = projectOf(projectId)
      if (unreadableDirections.has(projectId)) return []
      const held = heldDirections(projectId)
      const scanned = scannedDirections(
        held, clusterRecommendationProfile(projectDiscoveryProfile(projectId)), directionBasisOf(project), directionPapers(project),
      )
      if (scanned === null) return []
      if (scanned.found.length > 0 || (held !== undefined && held.basis !== scanned.next.basis)) {
        putDirections(projectId, scanned.next)
      }
      return scanned.found.map(({ id, label }) => ({ id, label }))
    }),

    setDiscoveryDirection: atomic((params) => {
      projectOf(params.projectId)
      const next = directionsAfter(heldDirections(params.projectId), params)
      const disabled = discoveryPreferences(params.projectId).disabledIntentIds
      putDirections(params.projectId, next, params.action === 'add' ? disabled.filter((id) => id !== params.directionId) : disabled)
    }),

    addDiscoveryEntries: atomic((projectId, found: DiscoveryPaper[], limit, ranking) => {
      const project = projectOf(projectId)
      const source = `项目 · ${project.name}`
      const reasonsOf = (paper: DiscoveryPaper) => ranking.scoreOf(batchIdOf(paper.semanticId, paper.id))?.reasons ?? []
      return deliver({ kind: 'discovery', id: project.id }, found, limit, (paper) => paperIdentity({
        arxiv: paper.id, ...doiField(paper), semanticId: paper.semanticId, title: paper.title, submitted: paper.submitted,
      }), (paper) => rescored({
        id: nextId('inbox'),
        kind: 'discovery',
        watch: '',
        project: project.id,
        source,
        title: paper.title,
        authors: paper.authors.join(', '),
        venue: paper.journalRef ?? `arXiv:${paper.id}`,
        abstract: paper.abstract,
        rec: '',
        reasons: reasonsOf(paper),
        downloaded: false,
        paper: '',
        pdf: paper.pdf,
        ...(paper.ranking === undefined ? {} : { ranking: paper.ranking }),
        topic: '',
        gone: false,
        arxiv: paper.id,
        semanticId: paper.semanticId,
        ...doiField(paper),
        meta: { authors: paper.authors, submitted: paper.submitted, journalRef: paper.journalRef },
      }, ranking), (entry, paper) => {
        const listed = withStream(entry, { kind: 'discovery', id: project.id, source, reasons: reasonsOf(paper) })
        return listed.semanticId === '' && paper.semanticId !== '' ? { ...listed, semanticId: paper.semanticId } : listed
      }, (fresh, held) => [...fresh, ...held], ranking).length
    }),

    scopeCards(scope) {
      scopeOf(scope)
      const shown = inFeed()
      return inbox.filter((entry) => shown(entry) && listedUnder(entry, scope.kind === 'project' ? 'discovery' : 'watch', scope.id))
        .map((entry) => ({
          id: entry.id, paperId: batchIdOf(entry.semanticId, entry.arxiv), title: entry.title, abstract: entry.abstract,
        }))
    },

    knownPapers(paperIds) {
      const known = new Map<string, KnownPaper>()
      for (const paperId of paperIds) {
        const entry = inbox.find((held) => batchIdOf(held.semanticId, held.arxiv) === paperId)
        if (entry !== undefined) {
          const page = papers.get(paperOf(entry.paper))
          const taken = entry.left === 'library' ? (page?.rating === 5 ? 'rated' : 'library') : entry.left === 'later' ? 'later' : undefined
          known.set(paperId, {
            title: entry.title, shortTitle: page?.shortTitle ?? shortTitleOf(entry.title), abstract: entry.abstract,
            ...(taken === undefined ? {} : { taken }),
          })
          continue
        }
        const page = [...papers.values()].find((paper) => `ARXIV:${libraryArxivId(paper)}` === paperId)
        if (page !== undefined) {
          known.set(paperId, { title: page.title, shortTitle: page.shortTitle ?? shortTitleOf(page.title), abstract: page.abstract ?? '' })
        }
      }
      return known
    },

    feedbackDiscovery: atomic((id, feedback) => {
      const entry = liveEntry(id)
      if (!listedUnder(entry, 'discovery')) throw new CallError('invalid', `这一条不是论文发现：${id}`)
      leaveEntry(id, feedback, { feedback })
      toTrash({
        id: nextId('trash'), kind: 'inbox', title: entry.title, deletedAt: nowMs(), entryId: id, feedback,
      })
    }),

    lastFetch() {
      return state.fetchedAt ?? null
    },

    setLastFetch(at) {
      saveState({ ...state, fetchedAt: at })
    },

    wikiHome() {
      return wikiHome(wikiData)
    },

    async wikiAggregation(id) {
      checkReadable(id)
      let graphs: WorkspaceGraphs = NO_WORKSPACE_GRAPHS
      const unread = () => experimentProjects(wikiData.pages[id])
        .filter((project) => projectById.get(project)?.workspaceSsh !== undefined && !graphs.has(project))
      // The page can change while the workspaces it cites are read; what it cites by then is read too.
      for (let ids = unread(); ids.length > 0; ids = unread()) graphs = new Map([...graphs, ...await readWorkspaceGraphs(ids)])
      checkReadable(id)
      return wikiAggregation(wikiData, id, versionOf(id)!, projectNames(), pointName(graphs))
    },

    wikiPaper(id) {
      checkReadable(id)
      if (wikiData.pages[id] === undefined) throw new CallError('not-found', `wiki 论文页不存在：${id}`)
      return wikiPaper(wikiData, id, versionOf(id)!)
    },

    wikiCards() {
      return wikiCards(wikiData)
    },

    applyProposal: atomic((proposal, producer, graphs = NO_WORKSPACE_GRAPHS) => {
      const data = wikiData
      const day = today()
      for (const id of touchedPages(proposal, data)) checkReadable(id)
      // Validate the complete proposal first so an invalid step writes no bytes.
      const next = applyProposal(data, proposal, day, worldOf(producer?.by ?? HUMAN, graphs))
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
          const [from, to] = [labelledLink(op.page, data.pages[op.page]!.fm.title), labelledLink(op.page, op.title)]
          for (const id of relabelled(data, op.page, op.title)) {
            rewriteLines(wikiFile(id), (line, part) => (part === 'body' ? line.replaceAll(from, to) : line), staging)
            setUpdated(wikiFile(id), day, staging)
          }
          setAggregationMetadata(wikiFile(op.page), { title: op.title, splitOn: op.splitOn }, staging)
          setUpdated(wikiFile(op.page), day, staging)
        } else if (op.op === 'setColumns') {
          setColumns(wikiFile(op.page), op.columns, staging)
          setUpdated(wikiFile(op.page), day, staging)
        }
      }
      // Claim ops may change several claims on several pages; write each changed claim once, in page order.
      for (const id of touchedPages(proposal, data)) {
        const after = next.pages[id]
        if (after === undefined || isPaper(after)) continue
        const held = new Map(((data.pages[id] as WikiAggregationRecord | undefined)?.fm.claims ?? []).map((c) => [c.id, c]))
        const kept = new Set((after.fm.claims ?? []).map((c) => c.id))
        let changed = false
        for (const claim of after.fm.claims ?? []) {
          if (JSON.stringify(held.get(claim.id)) === JSON.stringify(claim)) continue
          setClaim(wikiFile(id), claim, staging)
          changed = true
        }
        for (const gone of [...held.keys()].filter((c) => !kept.has(c))) {
          removeClaim(wikiFile(id), gone, staging)
          changed = true
        }
        if (changed) setUpdated(wikiFile(id), day, staging)
      }
      refill(next, refilled(proposal, data, next))
      // A paper's row names the aggregations it belongs to, so a rename rereads every member.
      const renamed = proposal.ops.flatMap((op) => (op.op === 'setAggregationMetadata' ? memberPapers(op.page) : []))
      rereadWiki([...touchedPages(proposal, data), ...renamed])
    }),

    checkProposal(ops, by, graphs = NO_WORKSPACE_GRAPHS) {
      for (const id of touchedPages({ ops }, wikiData)) checkReadable(id)
      applyProposal(wikiData, { ops }, today(), worldOf(by, graphs, by === HUMAN))
    },

    readWorkspaceGraphs,

    describeProposal(ops) {
      return ops.map((op) => describeOp(op, wikiData))
    },

    pagesWritten(ops) {
      return touchedPages({ ops }, wikiData)
    },

    pageVersion(id) {
      return versionOf(id)
    },

    wikiSignals() {
      return signals()
    },

    wikiBacklinks(id) {
      checkReadable(id)
      return wikiBacklinks(wikiData, id, {
        projects: [...projectById.values()].map((p) => ({
          id: p.id,
          name: p.name,
          papers: p.papers,
          pages: p.relations.flatMap((g) => g.items.flatMap((item) => (item.page === undefined ? [] : [item.page]))),
        })),
        ideas: ideas.map((idea) => ({ id: idea.id, title: idea.title, pages: idea.relations?.pages ?? [] })),
        chats: chats.filter((chat) => chat.messages.length > 0).map((chat) => ({
          id: chat.id, title: chat.title, paper: chat.paperId,
          sent: chat.messages.filter((m) => m.role === 'you').map((m) => m.runs.map((r) => r.text).join('')),
        })),
      })
    },

    proposalRecords() {
      return structuredClone(proposals)
    },

    saveProposalRecords(rows) {
      const next = structuredClone(rows)
      save('proposals', [...next, ...unreadProposals])
      proposals = next
    },

    nextProposalId() {
      return nextId('proposal')
    },

    proposalInbox() {
      if (!existsSync(inboxDir)) return []
      return readdirSync(inboxDir).filter((name) => name.endsWith('.json')).sort()
        .map((name) => ({ name, text: readFileSync(join(inboxDir, name), 'utf8') }))
    },

    dropProposalInboxFile(name) {
      removePage(join(inboxDir, name))
    },

    updateWikiPage: atomic((id, body) => {
      checkBody(id, body)
      checkReadable(id)
      if (wikiData.pages[id] === undefined) throw new CallError('not-found', `wiki 页不存在：${id}`)
      setBody(wikiFile(id), body, staging)
      setUpdated(wikiFile(id), today(), staging)
      rereadWiki([id])
    }),

    deleteWikiPage: atomic((id) => {
      checkReadable(id)
      const page = wikiData.pages[id]
      if (page === undefined || isPaper(page)) throw new CallError('not-found', `wiki 聚合不存在：${id}`)
      const rest = aggregationIds().filter((other) => other !== id)
      for (const other of rest) checkGenerated(wikiFile(other))
      const day = today()
      for (const child of subpagesOf(id)) {
        setParents(wikiFile(child), parentsAfterDelete(id, child), staging)
        setUpdated(wikiFile(child), day, staging)
      }
      const members = memberPapers(id)
      const entry = nextId('trash')
      movePage(wikiFile(id), trashPage(entry))
      toTrash({ id: entry, kind: 'page', title: page.fm.title, deletedAt: nowMs(), page: `wiki/${id}.md` })
      rereadWiki(members)
      refill(wikiData, rest)
    }),

    wikiDeletePages(id) {
      const children = subpagesOf(id)
      return [id, ...children, ...aggregationIds().sort().filter((other) => other !== id && !children.includes(other))]
    },

    mergeWikiPages: atomic((from, into, shown) => {
      const texts = mergeOutcome(from, into)
      const repointed = ideas.flatMap((idea) => {
        const before = idea.relations?.pages ?? []
        if (!before.includes(from)) return []
        return [{ id: idea.id, before, after: [...new Set(before.map((p) => (p === from ? into : p)))] }]
      })
      const cards = wikiCards(wikiData)
      const unchanged = (id: string, card: WikiAggregationCard): boolean =>
        JSON.stringify(cards.find((c) => c.id === id)) === JSON.stringify(card)
      if (!unchanged(from, shown.from) || !unchanged(into, shown.into)) {
        throw new CallError('changed', `「${labelOf(wikiData, from)}」或「${labelOf(wikiData, into)}」在你挑合并目标之后改过，没有合并。再挑一次`)
      }
      for (const { id, after } of texts) replacePage(wikiFile(id), after, staging)
      const entry = nextId('trash')
      movePage(wikiFile(from), trashPage(entry))
      toTrash({
        id: entry, kind: 'page', title: labelOf(wikiData, from), deletedAt: nowMs(), page: `wiki/${from}.md`,
        ...(repointed.length === 0 ? {} : { ideas: repointed }),
      })
      relateIdeas(repointed.map(({ id, before, after }) => ({ id, from: before, to: after })))
      for (const { id } of texts) {
        if (!id.startsWith(PROJECT_PATH)) continue
        const pid = id.slice(PROJECT_PATH.length)
        projectById.set(pid, readProjectPage(projectFile(pid), pid))
      }
      rereadWiki(texts.map((t) => t.id))
      refill(wikiData, aggregationIds())
    }),

    wikiMergePages(from, into) {
      const written = [...mergeOutcome(from, into).map((t) => t.id), from]
      return [...written, ...aggregationIds().sort().filter((id) => !written.includes(id))]
    },

    applyPaperWikiDraft: atomic((id, body) => {
      checkBody(id, body)
      checkReadable(id)
      if (wikiData.pages[id] === undefined) throw new CallError('not-found', `wiki 页不存在：${id}`)
      setBodyAndTrust(wikiFile(id), body, staging)
      setUpdated(wikiFile(id), today(), staging)
      rereadWiki([id])
    }),

    proposalPages(proposal, by = HUMAN, graphs = NO_WORKSPACE_GRAPHS) {
      const data = wikiData
      const next = applyProposal(data, proposal, today(), worldOf(by, graphs))
      const named = touchedPages(proposal, data)
      return [...named, ...refilled(proposal, data, next).filter((id) => !named.includes(id))]
    },

    readPages(paths) {
      return paths.map((path) => {
        const file = wikiFile(path)
        return { path, text: existsSync(file) ? readFileSync(file, 'utf8') : null }
      })
    },

    putPages: atomic((pages) => {
      for (const { path, text } of pages) {
        const file = wikiFile(path)
        if (text === null) removePage(file)
        else {
          replacePage(file, text, staging)
          // A page put back where it was deleted from no longer waits in the trash.
          const held = trash.find((item) => item.kind === 'page' && item.page === `wiki/${path}.md`)
          if (held !== undefined) {
            trash = saveTrash(trash.filter((item) => item !== held))
            discard(held)
            if (held.kind === 'page') putIdeasBack(held)
          }
        }
        if (!path.startsWith(PROJECT_PATH)) continue
        const id = path.slice(PROJECT_PATH.length)
        if (text === null) projectById.delete(id)
        else projectById.set(id, readProjectPage(file, id))
      }
      // A paper's row names the aggregations it belongs to, so each aggregation put back rereads its members.
      const paths = pages.map((p) => p.path)
      rereadWiki([...paths, ...paths.flatMap(memberPapers)])
    }),

    listTrash() {
      dropExpired()
      // An attachment cannot return after its project is deleted, nor a paper while another page stands where its page goes back,
      // nor a paper chat while its paper's chat holds messages.
      return trash.filter((item) => !returned(item)).map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        deletedAt: item.deletedAt,
        restorable: item.kind === 'attachment' ? projectById.has(item.projectId)
          : item.kind === 'ideaFile' ? ideas.some((idea) => idea.id === item.ideaId)
          : item.kind === 'chat' ? (paperChatNow(item)?.messages.length ?? 0) === 0
          : (item.kind !== 'paper' && item.kind !== 'page') || !existsSync(join(root, item.page)),
      }))
    },

    trashedPaper(id) {
      const item = trash.find((entry) => entry.id === id)
      return item?.kind === 'paper' ? basename(item.page, '.md') : undefined
    },

    restoreTrash: atomic((id) => {
      dropExpired()
      const item = trash.find((entry) => entry.id === id)
      if (!item) throw new CallError('not-found', `垃圾桶里没有这一条：${id}`)
      if (item.kind === 'paper') {
        checkPlaceFree(item)
        const back = join(root, item.page)
        movePage(trashPage(id), back)
        if (item.reading !== undefined) {
          readings = save('paper-readings', [...readings, item.reading])
        }
        const page = readPage(back)
        refreshWikiPage(page.id, back)
        indexPaper(page)
      } else if (item.kind === 'project') {
        checkPlaceFree(item)
        const back = join(root, item.page)
        const projectId = basename(item.page, '.md')
        movePage(trashPage(id), back)
        const restored = readProjectPage(back, projectId)
        projectById.set(projectId, restored)
        if (restored.status === FINISHED_PROJECT) archiveIdeasForProject(projectId)
      } else if (item.kind === 'page') {
        checkPlaceFree(item)
        movePage(trashPage(id), join(root, item.page))
        rereadWiki(memberPapers(trashedPageId(item.page)))
        refill(wikiData, aggregationIds())
        putIdeasBack(item)
      } else if (item.kind === 'inbox') {
        inbox = save('inbox', inbox.map((entry) => {
          if (entry.id !== item.entryId) return entry
          const restored = { ...entry, gone: false }
          delete restored.left
          if (item.feedback !== undefined) delete restored.feedback
          return restored
        }))
      } else if (item.kind === 'later') {
        later = save('later', [
          ...later.slice(0, item.position), structuredClone(item.later), ...later.slice(item.position),
        ])
      } else if (item.kind === 'chat') {
        const held = paperChatNow(item)
        if ((held?.messages.length ?? 0) > 0) throw new CallError('refused', `这篇论文已经有了新的对话：${item.title}`)
        const rest = chats.filter((chat) => chat !== held)
        // The chat goes back as the trash stored it, and is read again so its unknown fields stay for later saves.
        const records = lists.get('chats')?.stored(rest) ?? rest
        const at = Math.min(item.position, rest.length)
        const back = (storedRecord('trash', item) as { chat: unknown }).chat
        writeJson(join(meridian, 'chats.json'), [...records.slice(0, at), back, ...records.slice(at)], staging)
        chats = load('chats', ChatRecordSchema)
      } else if (item.kind === 'idea') {
        ideas = save('ideas', [structuredClone(item.idea), ...ideas])
        if (item.idea.project !== undefined) {
          const project = projectById.get(item.idea.project)
          if (project !== undefined) syncProjectWorkspace(project)
        }
      } else if (item.kind === 'ideaFile') {
        if (!ideas.some((idea) => idea.id === item.ideaId)) throw new CallError('not-found', `想法不存在：${item.ideaId}`)
        const own = ideaFiles.flatMap((file, at) => (file.idea === item.ideaId ? [at] : []))
        const at = item.position < own.length ? own[item.position]! : (own.at(-1) ?? -1) + 1
        ideaFiles = save('idea-files', [...ideaFiles.slice(0, at), { ...item.attachment, idea: item.ideaId }, ...ideaFiles.slice(at)])
      } else {
        const project = projectById.get(item.projectId)
        if (!project) throw new CallError('not-found', `项目不存在：${item.projectId}`)
        const { attachments } = project
        const at = Math.min(item.position ?? attachments.length, attachments.length)
        landProject(
          { ...project, attachments: [...attachments.slice(0, at), item.attachment, ...attachments.slice(at)] },
          ['attachments'],
        )
      }
      trash = saveTrash(trash.filter((entry) => entry !== item))
    }),

    purgeTrash(id) {
      dropExpired()
      const item = trash.find((entry) => entry.id === id)
      if (!item) throw new CallError('not-found', `垃圾桶里没有这一条：${id}`)
      trash = saveTrash(trash.filter((entry) => entry !== item))
      discard(item)
    },

    clearTrash() {
      const cleared = trash
      trash = saveTrash([])
      for (const item of cleared) discard(item)
    },

    async listFeed() {
      await absorbWorkspaceEvents()
      return feedNewestFirst(feed, today())
    },

    appendFeed({ source, body }) {
      const day = today()
      feed = save('feed', [...feed, {
        id: nextId('entry'), source, day: dayOf(day, day), time: FEED_NOW,
        createdAt: now().toISOString(),
        body: structuredClone(body),
      }])
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
      chats = save('chats', [chat, ...chats])
      return chatSession(chat)
    },

    chatForPaper(paperId) {
      const found = chats.find((held) => held.paperId === paperId)
      if (found !== undefined) return chatSession(found)
      const paper = papers.get(paperId)
      if (paper === undefined) throw new CallError('not-found', `论文不存在：${paperId}`)
      const created: ChatRecord = {
        id: nextId('chat'), title: paper.title, named: true, archived: false, messages: [], paperId,
      }
      chats = save('chats', [created, ...chats])
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
      chats = save('chats', chats.map((c) => (c.id === id ? next : c)))
    },

    replaceChatStatus(id, message) {
      const chat = chatOf(id)
      const kept = chat.messages.at(-1)?.role === 'status' ? chat.messages.slice(0, -1) : chat.messages
      const next: ChatRecord = { ...chat, messages: [...kept, { ...structuredClone(message), id: nextId('msg') }] }
      chats = save('chats', chats.map((c) => (c.id === id ? next : c)))
    },

    listIdeas() {
      absorbAgentIdeas()
      const sorted = [...ideas]
        .sort((a, b) => b.updated.localeCompare(a.updated) || b.id.localeCompare(a.id, undefined, { numeric: true }))
      return applyOrder(sorted, state.ideaOrder, (idea) => idea.id).map((idea) => structuredClone(readResearchIdea(idea)))
    },

    reorderIdeas(order) {
      const known = new Set(ideas.map((idea) => idea.id))
      saveState({ ...state, ideaOrder: [...order].filter((id) => known.has(id)) })
    },

    createIdea: atomic((chatId, title, body, sourceProject) => {
      if (sourceProject !== undefined) projectOf(sourceProject)
      const sourceChat = chatId === undefined ? undefined : chatOf(chatId)
      const sourcePaper = sourceChat?.paperId === undefined ? undefined : papers.get(sourceChat.paperId)
      const idea = createResearchIdea(nextId('idea'), title, body, sourceChat === undefined ? { chatTitle: MANUAL_SOURCE } : {
        chatId: sourceChat.id,
        chatTitle: sourceChat.title,
        ...(sourcePaper === undefined
          ? {}
          : { paperId: sourcePaper.id, paperTitle: sourcePaper.title }),
      }, today(), sourceProject)
      ideas = save('ideas', [idea, ...ideas])
      // Without a manual order the newest idea already leads; with one, it goes to the front of it.
      if (state.ideaOrder !== undefined) saveState({ ...state, ideaOrder: [idea.id, ...state.ideaOrder] })
      return structuredClone(idea)
    }),

    updateIdea(id, patch) {
      const current = ideas.find((idea) => idea.id === id)
      if (current === undefined) throw new CallError('not-found', `想法不存在：${id}`)
      const projectChanged = patch.project !== undefined && patch.project !== current.project
      const normalized = projectChanged && patch.node === undefined ? { ...patch, node: null } : patch
      const linked = normalized.project === undefined ? current.project : normalized.project ?? undefined
      if (linked !== undefined && !projectById.has(linked)) throw new CallError('not-found', `项目不存在：${linked}`)
      const node = normalized.node === undefined ? current.node : normalized.node ?? undefined
      if (node !== undefined && linked === undefined) {
        throw new CallError('invalid', '科研图节点必须属于想法关联的项目')
      }
      for (const related of patch.relations?.projects ?? []) {
        if (!projectById.has(related)) throw new CallError('not-found', `项目不存在：${related}`)
      }
      for (const page of patch.relations?.pages ?? []) {
        const target = wikiData.pages[page]
        if (target === undefined || isPaper(target)) throw new CallError('not-found', `wiki 聚合不存在：${page}`)
      }
      const completed = linked !== undefined && projectById.get(linked)?.status === FINISHED_PROJECT
      const next = updateResearchIdea(
        current, completed ? { ...normalized, archived: true } : normalized, today(),
      )
      ideas = save('ideas', ideas.map((idea) => (idea.id === id ? next : idea)))
      const affectedProjects = new Set([current.project, next.project])
      for (const projectId of affectedProjects) {
        if (projectId === undefined) continue
        const project = projectById.get(projectId)
        if (project !== undefined) syncProjectWorkspace(project)
      }
      return structuredClone(next)
    },

    deleteIdea: atomic((id) => {
      const idea = ideas.find((held) => held.id === id)
      if (idea === undefined) throw new CallError('not-found', `想法不存在：${id}`)
      ideas = save('ideas', ideas.filter((held) => held !== idea))
      if (idea.project !== undefined) {
        const project = projectById.get(idea.project)
        if (project !== undefined) syncProjectWorkspace(project)
      }
      toTrash({
        id: nextId('trash'), kind: 'idea', title: idea.title, deletedAt: nowMs(), idea,
      })
    }),

    listIdeaFiles() {
      absorbAgentIdeas()
      const listed = new Set(ideas.map((idea) => idea.id))
      return ideaFiles.filter((file) => listed.has(file.idea)).map(ideaFileOf)
    },

    addIdeaFile: atomic((ideaId, attachment) => {
      if (!isAbsolute(attachment.path)) throw new CallError('invalid', `附件路径不是绝对路径：${attachment.path}`)
      if (!ideas.some((idea) => idea.id === ideaId)) throw new CallError('not-found', `想法不存在：${ideaId}`)
      const record: IdeaFileRecord = { id: nextId('att'), ...attachment, idea: ideaId }
      ideaFiles = save('idea-files', [record, ...ideaFiles])
      return ideaFileOf(record)
    }),

    designFilePath(name) {
      return join(meridian, 'designs', name)
    },

    writeDesignFile: atomic((name, markdown) => {
      const file = join(meridian, 'designs', name)
      writePage(file, markdown, staging)
      return file
    }),

    deleteIdeaFile: atomic((ideaId, fileId) => {
      const own = ideaFiles.filter((file) => file.idea === ideaId)
      const position = own.findIndex((file) => file.id === fileId)
      const record = own[position]
      if (record === undefined) throw new CallError('not-found', `附件不存在：${fileId}`)
      ideaFiles = save('idea-files', ideaFiles.filter((file) => file !== record))
      const { idea, ...attachment } = record
      toTrash({
        id: nextId('trash'), kind: 'ideaFile', title: record.name, deletedAt: nowMs(), ideaId: idea, attachment, position,
      })
    }),

    recordAction: atomic((id, messageId) => {
      const chat = chatOf(id)
      const message = chat.messages.find((held) => held.id === messageId)
      if (!message) throw new CallError('not-found', `消息不存在：${messageId}`)
      const action = message.actions[0]
      if (action === undefined) throw new CallError('refused', `这条消息上没有要记入科研记录的话：${messageId}`)
      if (action.done === true) throw new CallError('refused', '这一条已经记入过科研记录')
      const detail = appendEvent(action.project, `${CHAT_EVENT_PREFIX}${action.text}`)
      chats = save('chats', chats.map((held) => (held !== chat ? held : {
        ...held,
        messages: held.messages.map((candidate) => (candidate !== message ? candidate : {
          ...candidate,
          actions: candidate.actions.map((candidateAction) => (candidateAction === action
            ? { ...candidateAction, done: true }
            : candidateAction)),
        })),
      })))
      return detail
    }),

    setChatArchived(id, archived) {
      const chat = chatOf(id)
      chats = save('chats', chats.map((c) => (c === chat ? { ...c, archived } : c)))
    },

    renameChat(id, title) {
      const chat = chatOf(id)
      if (chat.paperId !== undefined) throw new CallError('refused', '论文的阅读对话以论文命名，不能改名')
      const renamed: ChatRecord = { ...chat, title, named: true }
      chats = save('chats', chats.map((c) => (c.id === id ? renamed : c)))
      return chatSession(renamed)
    },

    chatIds() {
      dropExpired()
      return [...chats.map((chat) => chat.id), ...trash.flatMap((item) => (item.kind === 'chat' ? [item.chat.id] : []))]
    },

    deleteChat: atomic((id) => {
      const chat = chatOf(id)
      const position = chats.indexOf(chat)
      chats = save('chats', chats.filter((held) => held !== chat))
      toTrash({
        id: nextId('trash'), kind: 'chat', title: chat.title, deletedAt: nowMs(),
        chat: storedRecord('chats', chat) as ChatRecord, position,
      })
    }),

    search(query) {
      return searchHits({
        wiki: wikiData, projects: projects(), chats, papers: papers.values(), readings, ideas,
        later: later.filter((entry) => !pagesOf.has(entry.paper)),
      }, query, (id) => pdfOf(id) !== undefined)
    },
  }

  const store = withChangelog(ops, {
    load: (): ChangeRecord[] => {
      const file = join(meridian, 'changelog.json')
      if (!existsSync(file)) return []
      const log = parseChangeRecords(JSON.parse(readFileSync(file, 'utf8')))
      lists.set('changelog', log)
      changes = log.rows
      return log.rows
    },
    save: (rows) => {
      save('changelog', rows)
      changes = rows
    },
    nextId: () => nextId('change'),
    atomically,
  })
  try {
    store.pinProjectTopics()
  } catch (err) {
    console.error(`[project] 项目的主题没有对上主题页，照旧按名字显示：${err instanceof Error ? err.message : String(err)}`)
  }
  return store
}
