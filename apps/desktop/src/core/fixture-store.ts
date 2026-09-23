import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import changes from './fixtures/changes.json' with { type: 'json' }
import chatSessions from './fixtures/chats.json' with { type: 'json' }
import feedEntries from './fixtures/feed.json' with { type: 'json' }
import inboxEntries from './fixtures/inbox.json' with { type: 'json' }
import laterEntries from './fixtures/later.json' with { type: 'json' }
import papers from './fixtures/papers.json' with { type: 'json' }
import projects from './fixtures/projects.json' with { type: 'json' }
import watchList from './fixtures/watches.json' with { type: 'json' }
import wikiFixture from './fixtures/wiki.json' with { type: 'json' }
import proposalFixture from './fixtures/proposals.json' with { type: 'json' }
import type {
  Attachment, ChangeEntry, ChatMessage, ChatSession, Conclusion, DeliverySettings, FeedEntry, InboxEntry,
  GraphNode, LaterEntry, PaperColumns, PaperImportResult, PaperReading, PaperRow, ProjectDetail, ReadingMutation, SearchHit,
  ProposalRecord, ResearchIdea, Task, TaskFields, TrashEntry, Watch,
} from '../shared/contract.js'
import { AgentProposalSchema, DEFAULT_DELIVERY_SETTINGS } from '../shared/contract.js'
import { projectControlState } from '../shared/project-control.js'
import { topicDir, topicProposal } from '../shared/topic-proposal.js'
import {
  ACTIVE_PROJECT, CHAT_EVENT_PREFIX, FINISHED_PROJECT, PAPER_PAGE, PROJECTS_DIR, SEARCH_LIMIT,
  TRASH_RETENTION_DAYS,
  UNREAD_PAPER,
} from '../shared/vocabulary.js'
import type { ChangeRecord } from './changelog.js'
import { PROJECT_FIELDS, withChangelog } from './changelog.js'
import {
  applyReadingMutation, checkColumns, checkCustom, checkGroupKey, columnCells, emptyColumns,
  emptyPaperReading, facetPapers, freePageStem, laterWithMetadata, listPapers, missingMetadata,
  paperImportResult, parsePaperUpload, patchedCustom, readingNoteCount, remoteMetadata, renamedCell,
  renamedOptions, restoredColumn, retypedColumn,
} from './paper-library/index.js'
import {
  chatSource, CONCLUSION_CHANGED, concludedNodes, conclusionCounts, conclusionFingerprint, MANUAL_SOURCE,
  overviewResearch, placeNode, projectConclusions, readWorkspaceAgentIdeas, verifiedNodes, withProjectLinks,
} from './project-management/index.js'
import { inboxFields, unseenPapers } from './inbox/dedup.js'
import {
  applyRecommendationPreferences, buildRecommendationProfile, clusterRecommendationProfile,
  discoveryReasons, orderInbox, recommendationSeedIds,
  type DiscoveryPaper, type DiscoveryPreferences, type DiscoverySchedule,
} from './recommendation/index.js'
import { dayOf, feedNewestFirst, systemToday } from './dates.js'
import { createResearchIdea, updateResearchIdea } from './research-ideas/index.js'
import type { MetadataFill, VaultOps, VaultStore } from './vault.js'
import { digestOf } from './wiki-proposals.js'
import {
  applyProposal, checkBody, conclusionClaims, describeOp, projectClaims, projectDisputes, HUMAN, isPaper, pageVersion, recordText, touchedPages,
  wikiAggregation, wikiCards, wikiHome, wikiPaper, wikiSearchIndex, wikiSignals,
  type ClaimWorld, type WikiData, type WikiPaperRecord,
} from './wiki/index.js'

/** Trash entry with all content needed for restoration. `restorable` is derived from destination availability. */
type TrashRecord = Omit<TrashEntry, 'restorable'> & (
  | {
    kind: 'paper'; paper: PaperRow; source: string; page: WikiPaperRecord
    reading: PaperReading | undefined
  }
  | { kind: 'project'; project: FixtureProject }
  | { kind: 'idea'; idea: ResearchIdea }
  | { kind: 'attachment'; projectId: string; attachment: Attachment }
  | { kind: 'inbox'; entryId: string }
)

/** Seeded fixture change with cross-boundary fields but no undo/archive fields because it predates them. */
type SeededChange = Omit<ChangeEntry, 'undone' | 'undoable' | 'archived'>

/**
 * Stored paper record with cross-boundary fields except `readState`, which defaults when absent,
 * plus its referenced source. `id` identifies the page; only source retrieval uses `sourceId`.
 */
type PaperRecord = Omit<PaperRow, 'readState' | 'projects'> & { sourceId: string }

/** Fixture projects retain only fields that a project page can persist. */
type FixtureProject = Omit<
  ProjectDetail, 'paperCount' | 'paperTitles' | 'conclusions' | 'conclusionClaims' | 'projectConclusions'
>

/** Stored inbox recommendation: cross-boundary fields plus topics written to the paper page on import. */
type InboxRecord = InboxEntry & {
  semanticId: string
  vault: {
    topic: string
    arxiv: string
    meta: { authors: string[]; submitted: string; journalRef: string | null }
  }
}

/** Stored read-later item. `day` derives from vault today and `downloaded` from library presence; neither is stored. */
type LaterRecord = Omit<LaterEntry, 'day' | 'downloaded'>

/**
 * Stored chat: cross-boundary fields plus messages and whether its title is final. Message count is
 * derived. Unnamed ordinary chats use the first message as title; paper chats carry `paperId`.
 */
type ChatRecord = Omit<ChatSession, 'messageCount'>
  & {
    named: boolean
    messages: ChatMessage[]
    idea?: { feed: string; version: number; first: string }
  }

/** Prefix identifying project-page ids at page read/write boundaries. */
const PROJECT_PATH = `${PROJECTS_DIR}/`

/** Number of research records included in a project summary. */
const RECENT_EVENTS = 3

/** Demo you() behavior: name an untitled chat from this many characters of the first user message. */
const CHAT_TITLE_CHARS = 12

/** Legacy display timestamp retained for fixture compatibility. */
const FEED_NOW = '刚刚'

/** Fixture epoch. All fixture dates are arranged around this day and shift together to vault today. */
const FIXTURE_EPOCH = '2026-08-25'
/** Demo projCreateRow duration for a new project starting today. */
const NEW_PROJECT_SPAN_DAYS = 30

/** Imported downloaded paper whose Wiki page has not yet been authored. */
const NEW_PAPER_PAGE_STATE = 'draft'

/** Frontmatter values that mark a paper page's body as reviewed by whoever applied it. */
const TRUST_VALIDATION_STATE = 'text_converged'
const TRUST_TRUST_STATE = 'source_grounded_text'

/** Shift an epoch-relative fixture date to an equivalent date relative to `today`. */
function relative(iso: string, today: string): string {
  const shifted = Date.parse(`${today}T00:00:00Z`)
    + Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${FIXTURE_EPOCH}T00:00:00Z`)
  return new Date(shifted).toISOString().slice(0, 10)
}

/** Shift every date in a project to use `today` as the fixture epoch. */
function atToday(project: FixtureProject, today: string): FixtureProject {
  return {
    ...project,
    start: relative(project.start, today),
    due: relative(project.due, today),
    tasks: project.tasks.map((t) =>
      ({ ...t, start: relative(t.start, today), end: relative(t.end, today) })),
    milestones: project.milestones.map((m) => ({ ...m, date: relative(m.date, today) })),
    events: project.events.map((e) => ({ ...e, date: relative(e.date, today) })),
    conclusionList: project.conclusionList.map((conclusion) => ({
      ...conclusion, date: relative(conclusion.date, today),
    })),
  }
}

/**
 * Returns the vault root: `MERIDIAN_LIBRARY_ROOT` when set, otherwise the
 * `active_library_root` the user config records — both names belong to the
 * Python side. Throws if neither names one.
 */
function vaultRoot(): string {
  const override = process.env['MERIDIAN_LIBRARY_ROOT']
  if (override) return override
  const home = process.env['MERIDIAN_CONFIG_HOME'] ?? join(homedir(), '.meridian')
  const path = join(home, 'paper-wiki-workspaces.json')
  const config = JSON.parse(readFileSync(path, 'utf8')) as { active_library_root?: string }
  if (!config.active_library_root) throw new Error(`${path} 里没有记下活动的 vault`)
  return config.active_library_root
}

/** Throw when task dates or a partial-day window are reversed. */
function checkSpan(task: TaskFields): void {
  // The contract guarantees fixed-width ISO dates, so lexical order equals chronological order.
  if (task.end < task.start) throw new Error(`任务结束日期早于开始日期:${task.start} – ${task.end}`)
  if (task.start === task.end && task.window && task.window.end <= task.window.start) {
    throw new Error(`任务结束时间不晚于开始时间:${task.window.start} – ${task.window.end}`)
  }
}

/** Throw when a research-record body contains a newline. */
function checkOneLine(text: string): void {
  if (text.includes('\n')) throw new Error('科研记录一条占一行,正文里不能有换行')
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
 * Builds a VaultStore backed by the bundled paper and project fixtures,
 * isolated per instance. `today` supplies the vault's today, which dates every
 * write and from which the trash counts its retention; it defaults to the
 * system date. `now` supplies the exact time attached to newly imported
 * papers. The fixture dates are laid out around a fixed epoch and are
 * shifted onto that today as the store is built, so the gap between any two of
 * them, and between each of them and today, is the same whichever day the
 * store is built on. A store built before midnight keeps the day it was built
 * on, so its fixture data ages by a day once today moves on, as real data
 * would. The fixture projects are laid out in the order they were created and
 * a project created here is appended after them, so project order holds by
 * construction and nothing sorts.
 * `appliedProposalBodies` mirrors what a real vault's Harness proposal audit log would hold: for each
 * target id, the body of the most recent applied event recorded for it. It drives the same one-time
 * trust-state migration createVaultStore runs, so both implementations agree on its behavior; a real
 * app has none of this state before its first apply, so it defaults to empty.
 */
export function createFixtureStore(
  today: () => string = systemToday, now: () => Date = () => new Date(),
  appliedProposalBodies: Map<string, string> = new Map(),
): VaultStore {
  const builtOn = today()
  const byId = new Map((papers as PaperRecord[]).map((paper): [string, PaperRow] => {
    // The referenced source is used only for source retrieval and does not cross the boundary.
    const row: Omit<PaperRecord, 'sourceId'> & { sourceId?: string } = structuredClone(paper)
    delete row.sourceId
    return [row.id, {
      ...row, readState: UNREAD_PAPER, projects: [], addedAt: `${row.updated}T00:00:00.000Z`,
    }]
  }))
  /** Source referenced by each page and page referencing each source; fixtures map one source to one page. */
  const sourceOf = new Map((papers as PaperRecord[]).map((p) => [p.id, p.sourceId]))
  const pageOf = new Map((papers as PaperRecord[]).map((p) => [p.sourceId, p.id]))
  const importedSources = new Map<string, Uint8Array>()
  const readings = new Map<string, PaperReading>()
  const canonicalNoteCount = new Map([...byId].map(([id, paper]) => [id, paper.noteCount]))
  const projectById = new Map((projects as FixtureProject[])
    .map((p) => [p.id, atToday(structuredClone(p), builtOn)]))

  /** Cross-boundary project copy with paper count and titles derived from current library state. */
  /** The conclusions of `project` as the Conclusions view lists them. */
  const conclusionsOf = (project: FixtureProject) => projectConclusions(
    project, project.graph, projectClaims(wiki, project.id), projectDisputes(wiki, project.id),
  )

  const detailOf = (project: FixtureProject): ProjectDetail => {
    const paperTitles = Object.fromEntries(project.papers.flatMap((id) => {
      const paper = byId.get(id)
      return paper === undefined ? [] : [[id, paper.title]]
    }))
    const claims = conclusionClaims(wiki, project.id)
    const conclusions = conclusionsOf(project)
    return {
      ...structuredClone(project),
      paperTitles,
      paperCount: Object.keys(paperTitles).length,
      conclusions: conclusionCounts(conclusions),
      ...(Object.keys(claims).length === 0 ? {} : { conclusionClaims: claims }),
      projectConclusions: conclusions,
    }
  }

  /** Current paper-table rows overlaid with project-side relations and legacy conclusions. */
  const linkedRows = (): PaperRow[] => [...byId.values()].map(
    (row) => withProjectLinks(row, [...projectById.values()]),
  )
  let trash: TrashRecord[] = []
  let feed = (feedEntries as FeedEntry[]).map((e) => structuredClone(e))
  let inbox = (inboxEntries as InboxRecord[]).map((e) => ({
    ...structuredClone(e),
    kind: e.kind ?? 'watch',
    project: e.project ?? '',
    reasons: e.reasons ?? [],
    semanticId: e.semanticId ?? '',
  }))
  let later = (laterEntries as LaterRecord[])
    .map((e) => ({ ...structuredClone(e), added: relative(e.added, builtOn) }))
  let watches = (watchList as Watch[]).map((w) => structuredClone(w))
  let chats = (chatSessions as ChatRecord[]).map((c) => structuredClone(c))
  let ideas: ResearchIdea[] = [{
    id: 'idea-dynamic-tree-budget',
    title: '用可学习性信号动态分配 draft model 的蒸馏预算',
    body: '把 token teachability score 与 speculative acceptance loss 结合：只对 teacher-student disagreement 高且可学习的 token 加大蒸馏权重，低可学习性 token 降权。先在现有项目里做 fixed、entropy、teachability 三组权重消融，比较相同训练预算下的 acceptance rate。',
    source: { chatId: 'amortize', chatTitle: '摊薄的前提是共享前缀吗' },
    project: 'draft', archived: false, created: builtOn, updated: builtOn,
  }]
  let wiki = structuredClone(wikiFixture as WikiData)
  // One-time trust-state migration, mirroring createVaultStore: a paper page missing either key whose
  // body matches the most recent applied event recorded for it gets both keys set.
  for (const [id, page] of Object.entries(wiki.pages)) {
    if (!isPaper(page) || (page.fm.validation_state !== undefined && page.fm.trust_state !== undefined)) continue
    const applied = appliedProposalBodies.get(id.slice(PAPER_PAGE.length))
    if (applied === undefined || applied.trim() !== page.body) continue
    wiki = {
      ...wiki,
      pages: {
        ...wiki.pages,
        [id]: { ...page, fm: { ...page.fm, validation_state: TRUST_VALIDATION_STATE, trust_state: TRUST_TRUST_STATE } },
      },
    }
  }
  let columns: PaperColumns = emptyColumns()
  // Manual display order set by reorderProjects/reorderIdeas; absent until the list is reordered.
  let projectOrder: string[] | undefined
  let ideaOrder: string[] | undefined
  // `<project id>:<idea id>` of each workspace agent idea already taken into the idea list.
  const takenAgentIdeas = new Set<string>()
  // Research-record events already copied into the feed; null until the first pass marks the existing ones.
  let feedEvents: Set<string> | null = null
  // Dismissal and read-later both hide an inbox item while preserving its original slot for restoration.
  const gone = new Set<string>()
  // Track papers with an explicit read state so undo can distinguish absent state from stored unread.
  const stated = new Set<string>()
  let seq = 0
  let fetchedAt: number | null = null
  const discoverySchedules = new Map<string, DiscoverySchedule>()
  const discoveryPreferences = new Map<string, DiscoveryPreferences>()
  let deliveryConfig: DeliverySettings = structuredClone(DEFAULT_DELIVERY_SETTINGS)
  // Fixture ids use t1/m1/r1/f1/feed-1/chg-1 shapes; new prefixes must not collide with them.
  const nextId = (prefix: string) => `${prefix}-${++seq}`

  /** Page version of fixture page `id`, from the text its record stands for; null when there is no such page. */
  const versionOf = (id: string): ReturnType<typeof pageVersion> => {
    const page = wiki.pages[id]
    return page === undefined ? null : pageVersion(recordText(page))
  }

  /** Every project's name, by id. */
  const projectNames = (): Record<string, string> =>
    Object.fromEntries([...projectById.values()].map((p) => [p.id, p.name]))

  /** The claim-validation world for producer `by`: the fixture projects and reading records. */
  const worldOf = (by: string, requireVerified = true): ClaimWorld => ({
    by,
    requireVerified,
    project: (id) => {
      const project = projectById.get(id)
      if (project === undefined) return undefined
      return {
        nodes: project.graph.nodes.map((n) => n.id),
        conclusions: project.conclusionList.map((c) => c.id),
        concluded: concludedNodes(project.graph).map((n) => n.id),
        verified: [...verifiedNodes(project, project.graph).keys()],
        verifiedConclusions: project.conclusionList.filter((c) => c.state === 'verified').map((c) => c.id),
      }
    },
    reading: (paper) => {
      const reading = readings.get(paper.slice(PAPER_PAGE.length))
      return { highlights: reading?.highlights.map((h) => h.id) ?? [], notes: reading?.notes.map((n) => n.id) ?? [] }
    },
  })

  /** The review queue, seeded with the fixture's agent proposals, newest first; `ageHours` dates each before now. */
  let proposals: ProposalRecord[] = (proposalFixture as { ageHours: number; status: ProposalRecord['status']; reason: ProposalRecord['reason']; proposal: unknown }[])
    .map((held) => {
      const proposal = AgentProposalSchema.parse(held.proposal)
      const received = now().getTime() - held.ageHours * 3_600_000
      return {
        id: nextId('proposal'), digest: digestOf(proposal), proposal, received, path: 'review' as const,
        status: held.status, reason: held.reason,
        decided: held.status === 'queued' ? null : { at: received + 3_600_000, by: '我' as const },
        change: null, notice: null,
      }
    })
  /** Current vault time as epoch milliseconds at today's UTC midnight, used for trash timestamps and retention. */
  const nowMs = () => Date.parse(`${today()}T00:00:00Z`)

  /** Project completion archives linked ideas one-way; reopening the project does not unarchive them automatically. */
  const archiveIdeasForProject = (projectId: string): void => {
    const day = today()
    ideas = ideas.map((idea) => (
      idea.project === projectId && !idea.archived ? { ...idea, archived: true, updated: day } : idea
    ))
  }

  /** Live inbox entry. Throw when the id is absent from the inbox. */
  const liveEntry = (id: string): InboxRecord => {
    const entry = inbox.find((e) => e.id === id && !gone.has(e.id))
    if (!entry) throw new Error(`收件里没有这一条:${id}`)
    return entry
  }

  /**
   * Drop entries and stored content after retention expires. Listing trash and looking up by id both
   * sweep first; emptying trash removes everything and does not need this pass.
   */
  const dropExpired = () => {
    const cutoff = nowMs() - TRASH_RETENTION_DAYS * 86_400_000
    trash = trash.filter((item) => item.deletedAt > cutoff)
  }

  /**
   * Inbox and read-later records store a source id. If a library page already references that source,
   * return the page id so the UI can open it; otherwise only the source id is available.
   */
  const paperOf = (source: string): string => pageOf.get(source) ?? source

  const arxivSeed = (paper: PaperRow | undefined): string | null => {
    if (paper === undefined) return null
    const named = paper.identifier?.match(/^arXiv:(.+)$/i)?.[1]?.replace(/v\d+$/, '')
    if (named) return named
    return /^\d{4}\.\d{4,5}(?:v\d+)?$/.test(paper.id) ? paper.id.replace(/v\d+$/, '') : null
  }

  const projectDiscoveryProfile = (projectId: string) => {
    const project = projectById.get(projectId)
    if (!project) throw new Error(`项目不存在:${projectId}`)
    const discovered = inbox.filter((entry) => entry.kind === 'discovery' && entry.project === projectId)
    const linkedPapers = project.papers.flatMap((id) => {
      const paper = byId.get(id)
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
        ...(project.graph.activeNodes ?? []).flatMap((id) => {
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
  const projectDiscoveryIntents = (projectId: string) => applyRecommendationPreferences(
    clusterRecommendationProfile(projectDiscoveryProfile(projectId)),
    discoveryPreferences.get(projectId) ?? { coreIntentId: null, disabledIntentIds: [] },
  )

  /** Stored chat. Throw when the id is absent from the vault. */
  const chatOf = (id: string): ChatRecord => {
    const chat = chats.find((c) => c.id === id)
    if (!chat) throw new Error(`会话不存在:${id}`)
    return chat
  }

  const chatSession = ({ id, title, archived, messages, paperId }: ChatRecord): ChatSession => ({
    id, title, archived, messageCount: messages.length,
    ...(paperId === undefined ? {} : { paperId }),
  })

  /** Append a research record dated with vault today, optionally linked to a research-graph node. */
  const appendEvent = (projectId: string, text: string, node?: string): ProjectDetail => {
    const project = projectById.get(projectId)
    if (!project) throw new Error(`项目不存在:${projectId}`)
    checkOneLine(text)
    if (node !== undefined && !project.graph.nodes.some((item) => item.id === node)) {
      throw new Error(`节点不存在:${node}`)
    }
    const nextProject = {
      ...project,
      events: [
        ...project.events,
        {
          date: today(), text, kind: 'note' as const,
          ...(node === undefined ? {} : { node }),
        },
      ],
    }
    projectById.set(projectId, nextProject)
    return detailOf(nextProject)
  }

  // Seeded fixture changes predate undo support and are historical records without restoration data.
  let changelog: ChangeRecord[] = (changes as SeededChange[]).map(({ date, ...c }) => ({
    ...structuredClone(c),
    undone: false, archived: false, target: null, after: '',
    // Disk stores only `at`; shift the hand-authored fixture date around the epoch before converting it.
    at: Date.parse(`${relative(date, builtOn)}T00:00:00Z`), restore: null,
  }))

  /**
   * Paper-table topics and methods derive from memberships and update when memberships change.
   * `updated` always comes from the page's current `fm.updated`; other derived values recalculate only
   * when membership changes.
   */
  const rederiveRows = (from: WikiData, to: WikiData): void => {
    for (const id of new Set([...Object.keys(from.pages), ...Object.keys(to.pages)])) {
      const page = to.pages[id]
      if (page === undefined || page.kind !== 'paper' || page === from.pages[id]) continue
      const row = byId.get(id.slice(PAPER_PAGE.length))
      if (row === undefined) continue
      const memberships = (p: WikiData['pages'][string] | undefined) =>
        JSON.stringify((p as WikiPaperRecord | undefined)?.fm.memberships ?? [])
      const titles = (kind: string) => ((page as WikiPaperRecord).fm.memberships ?? [])
        .filter((m) => to.pages[m.in]?.kind === kind)
        .map((m) => (to.pages[m.in] as { fm: { title: string } }).fm.title)
      byId.set(row.id, {
        ...row,
        ...(memberships(from.pages[id]) === memberships(page) ? {} : { topics: titles('topic'), methods: titles('method') }),
        updated: String(page.fm.updated),
      })
    }
  }

  /** Stores PDF bytes in fixture memory and creates an unfiled paper page for a new source. */
  const storeUpload = (filename: string, bytes: Uint8Array): PaperImportResult => {
    const upload = parsePaperUpload(filename, bytes)
    const existing = pageOf.get(upload.sourceId)
    if (existing) return paperImportResult('existing', byId.get(existing)!)
    const id = freePageStem(upload.title, upload.sourceId, (name) => byId.has(name))
    const day = today()
    const paper: PaperRow = {
      id,
      title: upload.title,
      addedAt: now().toISOString(),
      venue: '',
      topics: [],
      methods: [],
      datasets: [],
      metrics: [],
      pageState: NEW_PAPER_PAGE_STATE,
      readState: UNREAD_PAPER,
      projects: [],
      pageCount: 0,
      noteCount: 0,
      conclusionCount: 0,
      updated: day,
      custom: {},
    }
    byId.set(id, paper)
    sourceOf.set(id, upload.sourceId)
    pageOf.set(upload.sourceId, id)
    importedSources.set(upload.sourceId, new Uint8Array(upload.bytes))
    canonicalNoteCount.set(id, 0)
    stated.add(id)
    wiki = {
      ...wiki,
      pages: {
        ...wiki.pages,
        [PAPER_PAGE + id]: {
          kind: 'paper', fm: {
            title: upload.title, added_at: paper.addedAt, updated: day, memberships: [],
          }, body: '',
        },
      },
    }
    return paperImportResult('added', paper)
  }

  /** Fills only missing bibliographic fields and updates queued copies of the same source. */
  const fillPaper = (id: string, fill: MetadataFill, replaceTitle: string | null): string[] => {
    const paper = byId.get(id)
    if (!paper) throw new Error(`论文不存在:${id}`)
    const write = missingMetadata(paper, fill, replaceTitle)
    const written = Object.keys(write)
    if (written.length === 0) return []
    const filled: PaperRow = { ...paper, ...write, updated: today() }
    byId.set(id, filled)
    const source = sourceOf.get(id)
    later = later.map((entry) => (entry.paper === source
      ? laterWithMetadata(entry, filled, write.title !== undefined)
      : entry))
    return written
  }

  /** Returns an inbox record even after it has left the visible inbox. */
  const downloadableEntry = (id: string): InboxRecord => {
    const entry = inbox.find((held) => held.id === id)
    if (!entry) throw new Error(`收件里没有这一条:${id}`)
    if (entry.downloaded) throw new Error(`这一条已经入库:${id}`)
    return entry
  }

  const ops: VaultOps = {
    today,

    listPapers(params) {
      if (params.facet) checkGroupKey(params.facet.field, columns)
      const { rows, total } = listPapers(linkedRows(), params)
      return { rows: rows.map((r) => structuredClone(r)), total }
    },

    facetPapers(field, filter) {
      checkGroupKey(field, columns)
      return facetPapers(linkedRows(), field, filter)
    },

    getPaper(id) {
      const paper = byId.get(id)
      if (!paper) throw new Error(`论文不存在:${id}`)
      return structuredClone(withProjectLinks(paper, [...projectById.values()]))
    },

    updatePaper(id, patch) {
      const paper = byId.get(id)
      if (!paper) throw new Error(`论文不存在:${id}`)
      const { custom, shortTitle, year, rating, identifier, submitted, ...fields } = patch
      if (custom !== undefined) checkCustom(columns, custom, paper.custom)
      const next: PaperRow = {
        ...paper,
        ...fields,
        ...(shortTitle === undefined || shortTitle === null ? {} : { shortTitle }),
        ...(year === undefined || year === null ? {} : { year }),
        ...(rating === undefined || rating === null ? {} : { rating }),
        ...(identifier === undefined || identifier === null ? {} : { identifier }),
        ...(submitted === undefined || submitted === null ? {} : { submitted }),
        ...(custom === undefined ? {} : { custom: patchedCustom(paper.custom, custom) }),
        updated: today(),
      }
      if (shortTitle === null) delete next.shortTitle
      if (year === null) delete next.year
      if (rating === null) delete next.rating
      if (identifier === null) delete next.identifier
      if (submitted === null) delete next.submitted
      byId.set(id, next)
      if (patch.title !== undefined || patch.shortTitle !== undefined) {
        const fresh = byId.get(id)!
        chats = chats.map((session) => (session.paperId === id
          ? { ...session, title: fresh.title }
          : session))
      }
      if (patch.readState !== undefined) stated.add(id)
    },

    paperSnapshot(id) {
      const paper = byId.get(id)
      if (!paper) throw new Error(`论文不存在:${id}`)
      return {
        title: paper.title,
        ...(paper.shortTitle === undefined ? {} : { shortTitle: paper.shortTitle }),
        ...(paper.authors === undefined ? {} : { authors: [...paper.authors] }),
        ...(paper.year === undefined ? {} : { year: paper.year }),
        venue: paper.venue,
        ...(paper.rating === undefined ? {} : { rating: paper.rating }),
        ...(paper.identifier === undefined ? {} : { identifier: paper.identifier }),
        ...(paper.submitted === undefined ? {} : { submitted: paper.submitted }),
        topics: [...paper.topics],
        ...(stated.has(id) ? { readState: paper.readState } : {}),
        updated: paper.updated,
        custom: { ...paper.custom },
      }
    },

    putPaper(id, snapshot) {
      const paper = byId.get(id)
      if (!paper) throw new Error(`论文不存在:${id}`)
      byId.set(id, {
        ...paper,
        title: snapshot.title ?? paper.title,
        ...(snapshot.shortTitle === undefined ? { shortTitle: undefined } : { shortTitle: snapshot.shortTitle }),
        ...(snapshot.authors === undefined ? { authors: undefined } : { authors: [...snapshot.authors] }),
        ...(snapshot.year === undefined ? { year: undefined } : { year: snapshot.year }),
        venue: snapshot.venue ?? paper.venue,
        ...(snapshot.rating === undefined ? { rating: undefined } : { rating: snapshot.rating }),
        ...(snapshot.identifier === undefined ? { identifier: undefined } : { identifier: snapshot.identifier }),
        ...(snapshot.submitted === undefined ? { submitted: undefined } : { submitted: snapshot.submitted }),
        topics: [...snapshot.topics],
        readState: snapshot.readState ?? UNREAD_PAPER,
        updated: snapshot.updated,
        custom: { ...snapshot.custom },
      })
      const restored = byId.get(id)!
      chats = chats.map((session) => (session.paperId === id
        ? { ...session, title: restored.title }
        : session))
      if (snapshot.readState === undefined) stated.delete(id)
      else stated.add(id)
    },

    putProject(project) {
      const held = projectById.get(project.id)
      if (!held) throw new Error(`项目不存在:${project.id}`)
      const fields = Object.fromEntries(PROJECT_FIELDS.map((key) => [key, structuredClone(project[key])]))
      projectById.set(project.id, { ...held, ...fields })
      if (project.status === FINISHED_PROJECT) archiveIdeasForProject(project.id)
    },

    deletePaper(id) {
      const paper = byId.get(id)
      if (!paper) throw new Error(`论文不存在:${id}`)
      const source = sourceOf.get(id) ?? ''
      const reading = readings.get(id)
      const page = wiki.pages[PAPER_PAGE + id]
      if (page === undefined || page.kind !== 'paper') throw new Error(`wiki 论文页不存在:${PAPER_PAGE}${id}`)
      byId.delete(id)
      sourceOf.delete(id)
      pageOf.delete(source)
      readings.delete(id)
      const pages = { ...wiki.pages }
      delete pages[PAPER_PAGE + id]
      wiki = { ...wiki, pages }
      trash = [
        {
          id: nextId('trash'), kind: 'paper', title: paper.title, deletedAt: nowMs(),
          paper, source, page: page as WikiPaperRecord, reading,
        },
        ...trash,
      ]
    },

    paperSource(id) {
      if (!byId.has(id)) throw new Error(`论文不存在:${id}`)
      const source = sourceOf.get(id)
      const imported = source === undefined ? undefined : importedSources.get(source)
      if (imported !== undefined) return new Uint8Array(imported)
      const dir = join(vaultRoot(), 'sources', 'papers')
      const file = source === undefined
        ? undefined
        : readdirSync(dir).find((name) => name.startsWith(`${source}-`) && name.endsWith('.pdf'))
      if (!file) throw new Error(`库里没有这一篇的原文:${id}`)
      return new Uint8Array(readFileSync(join(dir, file)))
    },

    importPaper: storeUpload,

    fillPaperMetadata: fillPaper,

    paperReading(id) {
      if (!byId.has(id)) throw new Error(`论文不存在:${id}`)
      return structuredClone(readings.get(id) ?? emptyPaperReading(id))
    },

    mutatePaperReading(id, mutation: ReadingMutation) {
      const paper = byId.get(id)
      if (!paper) throw new Error(`论文不存在:${id}`)
      const next = applyReadingMutation(
        readings.get(id) ?? emptyPaperReading(id), mutation, nextId, today(),
      )
      readings.set(id, next)
      const row: PaperRow = {
        ...paper,
        noteCount: (canonicalNoteCount.get(id) ?? 0) + readingNoteCount(next),
      }
      if (next.remark === '') delete row.remark
      else row.remark = next.remark
      byId.set(id, row)
      return structuredClone(next)
    },

    paperColumns() {
      return structuredClone(columns)
    },

    setPaperColumns(next) {
      checkColumns(next, [...byId.values()])
      columns = structuredClone(next)
    },

    renamePaperOption(key, from, to) {
      const options = renamedOptions(columns, key, from, to)
      const day = today()
      for (const row of [...byId.values()]) {
        const cell = renamedCell(row, key, from, to)
        if (cell === undefined) continue
        byId.set(row.id, { ...row, custom: { ...row.custom, [key]: cell }, updated: day })
      }
      columns = {
        ...columns,
        custom: columns.custom.map((c) => (c.key === key ? { ...c, options } : c)),
      }
    },

    setPaperColumnType(key, type) {
      const { columns: next, cells } = retypedColumn(columns, [...byId.values()], key, type)
      const day = today()
      for (const [id, cell] of cells) {
        const row = byId.get(id)!
        byId.set(id, { ...row, custom: patchedCustom(row.custom, { [key]: cell ?? null }), updated: day })
      }
      columns = next
    },

    paperCells(key) {
      return structuredClone(columnCells([...byId.values()], key))
    },

    putPaperColumn(column, groupAt, cells) {
      const { columns: next, cells: changed } = restoredColumn(columns, [...byId.values()], column, groupAt, cells)
      const day = today()
      for (const [id, cell] of changed) {
        const row = byId.get(id)!
        byId.set(id, { ...row, custom: patchedCustom(row.custom, { [column.key]: cell ?? null }), updated: day })
      }
      columns = structuredClone(next)
    },

    listProjects() {
      return applyOrder([...projectById.values()], projectOrder, (p) => p.id).map((p) => ({
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
          activeNodes: overviewResearch(p.graph).activeNodes,
        }),
        conclusions: conclusionCounts(conclusionsOf(p)),
        paperCount: p.papers.filter((id) => byId.has(id)).length,
        milestones: p.milestones.map(({ date, done }) => ({ date, done })),
        recentEvents: p.events.slice(-RECENT_EVENTS)
          .map(({ date, text, origin }) => ({ date, text, ...(origin === undefined ? {} : { origin }) })),
      }))
    },

    reorderProjects(order) {
      const known = new Set(projectById.keys())
      projectOrder = [...order].filter((id) => known.has(id))
    },

    overviewProjects() {
      return applyOrder([...projectById.values()], projectOrder, (p) => p.id).map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        priority: p.priority,
        focus: p.focus,
        ...(p.block === undefined ? {} : { block: p.block }),
        start: p.start,
        due: p.due,
        conclusions: conclusionCounts(conclusionsOf(p)),
        tasks: p.tasks.map((task) => ({
          ...task,
          ...(task.window === undefined ? {} : { window: { ...task.window } }),
        })),
        milestones: p.milestones.map((m) => ({ ...m })),
        events: p.events.map((e) => ({ ...e })),
        research: overviewResearch(p.graph),
      }))
    },

    createProject(name) {
      const start = today()
      const project: FixtureProject = {
        id: nextId('proj'),
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
        events: [{ date: start, text: '创建项目', kind: 'project' as const }],
        relations: [],
        attachments: [],
        graph: { nodes: [], edges: [] },
        agentSessions: [],
      }
      projectById.set(project.id, project)
    },

    getProject(id) {
      const project = projectById.get(id)
      if (!project) throw new Error(`项目不存在:${id}`)
      const nodeIds = new Set(project.graph.nodes.map((n) => n.id))
      for (const [from, to] of project.graph.edges) {
        if (!nodeIds.has(from) || !nodeIds.has(to)) {
          throw new Error(`科研图的边指向不存在的节点:${from} → ${to}`)
        }
      }
      return detailOf(project)
    },

    bindProjectWorkspace(id, binding) {
      const project = projectById.get(id)
      if (!project) throw new Error(`项目不存在:${id}`)
      const next = { ...project }
      if (binding === null) delete next.workspace
      else if (binding.kind === 'local') {
        next.workspace = {
          kind: 'local', root: binding.root, state: 'ready',
          planPath: join(binding.root, '.meridian/control/plan.json'), events: [],
        }
      } else {
        next.workspace = {
          kind: 'ssh', root: binding.path, host: binding.host,
          ...(binding.port === undefined ? {} : { port: binding.port }),
          state: 'ready',
          planPath: `${binding.host}:${binding.path}/.meridian/control/plan.json`,
          events: [],
        }
      }
      projectById.set(id, next)
      return detailOf(next)
    },

    updateProject(id, patch) {
      const project = projectById.get(id)
      if (!project) throw new Error(`项目不存在:${id}`)
      const { block, ...fields } = patch
      const next: FixtureProject = { ...project, ...fields }
      if (block === null) delete next.block
      if (typeof block === 'string') next.block = block
      // The contract guarantees fixed-width ISO dates, so lexical order equals chronological order.
      if (next.due < next.start) throw new Error(`项目截止日期早于开始日期:${next.start} – ${next.due}`)
      projectById.set(id, next)
      if (next.status === FINISHED_PROJECT) archiveIdeasForProject(id)
      return detailOf(next)
    },

    deleteProject(id) {
      const project = projectById.get(id)
      if (!project) throw new Error(`项目不存在:${id}`)
      projectById.delete(id)
      const removedEntries = new Set(
        inbox.filter((entry) => entry.kind === 'discovery' && entry.project === id)
          .map((entry) => entry.id),
      )
      inbox = inbox.filter((entry) => !removedEntries.has(entry.id))
      for (const entryId of removedEntries) gone.delete(entryId)
      trash = trash.filter((item) => item.kind !== 'inbox' || !removedEntries.has(item.entryId))
      trash = [
        { id: nextId('trash'), kind: 'project', title: project.name, deletedAt: nowMs(), project },
        ...trash,
      ]
    },

    createTask(projectId, task, origin) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      checkSpan(task)
      const made = { ...task, id: nextId('task'), ...(origin === undefined ? {} : { origin }) }
      const nextProject = { ...project, tasks: [made, ...project.tasks] }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    agentTaskRequests() {
      return []
    },

    addAgentTask(projectId, request) {
      return this.createTask(projectId, {
        title: request.title, start: request.date, end: request.date, state: 'plan', priority: 'p1',
        ...(request.note === undefined ? {} : { note: request.note }),
      }, 'agent')
    },

    updateTask(projectId, taskId, patch) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      const task = project.tasks.find((t) => t.id === taskId)
      if (!task) throw new Error(`任务不存在:${taskId}`)
      const { window, ...fields } = patch
      // Core removes undefined patch keys; this assertion preserves the exact merged required-field type.
      const nextTask = { ...task, ...fields } as Task
      if (window === null) delete nextTask.window
      else if (window !== undefined) nextTask.window = window
      checkSpan(nextTask)
      const nextProject = { ...project, tasks: project.tasks.map((t) => (t.id === taskId ? nextTask : t)) }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    deleteTask(projectId, taskId) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      if (!project.tasks.some((t) => t.id === taskId)) throw new Error(`任务不存在:${taskId}`)
      const nextProject = { ...project, tasks: project.tasks.filter((t) => t.id !== taskId) }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    reorderTasks(projectId, order) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      const byId = new Map(project.tasks.map((t) => [t.id, t]))
      if (order.length !== project.tasks.length || !order.every((id) => byId.has(id))) {
        throw new Error('任务顺序与项目任务不匹配')
      }
      const nextProject = { ...project, tasks: order.map((id) => byId.get(id)!) }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    createMilestone(projectId, milestone) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      const nextProject = {
        ...project,
        milestones: [{ ...milestone, id: nextId('ms') }, ...project.milestones],
      }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    updateMilestone(projectId, milestoneId, patch) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      const milestone = project.milestones.find((m) => m.id === milestoneId)
      if (!milestone) throw new Error(`里程碑不存在:${milestoneId}`)
      const nextMilestone = { ...milestone, ...patch }
      const nextProject = {
        ...project,
        milestones: project.milestones.map((m) => (m.id === milestoneId ? nextMilestone : m)),
      }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    deleteMilestone(projectId, milestoneId) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      if (!project.milestones.some((m) => m.id === milestoneId)) {
        throw new Error(`里程碑不存在:${milestoneId}`)
      }
      const nextProject = {
        ...project,
        milestones: project.milestones.filter((m) => m.id !== milestoneId),
      }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    createRelation(projectId, { group, text, page, url }) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      if (page !== undefined) {
        const target = wiki.pages[page]
        if (target === undefined || isPaper(target)) throw new Error(`wiki 聚合不存在:${page}`)
      }
      if (page !== undefined && url !== undefined) throw new Error('关联不能同时指向 Wiki 页和链接')
      const item = {
        id: nextId('rel'), text,
        ...(page === undefined ? {} : { page }),
        ...(url === undefined ? {} : { url }),
      }
      const seen = project.relations.some((r) => r.group === group)
      const relations = seen
        ? project.relations.map((r) => (r.group === group ? { ...r, items: [item, ...r.items] } : r))
        : [...project.relations, { group, items: [item] }]
      const nextProject = { ...project, relations }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    deleteRelation(projectId, relationId) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      if (!project.relations.some((r) => r.items.some((i) => i.id === relationId))) {
        throw new Error(`关联不存在:${relationId}`)
      }
      const nextProject = {
        ...project,
        relations: project.relations.map((r) => ({ ...r, items: r.items.filter((i) => i.id !== relationId) })),
      }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    addPaper(projectId, paperId) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      if (!byId.has(paperId)) throw new Error(`论文不存在:${paperId}`)
      if (project.papers.includes(paperId)) throw new Error(`已经关联过这篇论文:${paperId}`)
      const nextProject = { ...project, papers: [paperId, ...project.papers] }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    removePaper(projectId, paperId) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      if (!project.papers.includes(paperId)) throw new Error(`项目没有关联这篇论文:${paperId}`)
      const nextProject = { ...project, papers: project.papers.filter((id) => id !== paperId) }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    moveRelation(projectId, id, index) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      const commit = (nextProject: typeof project) => {
        projectById.set(projectId, nextProject)
        return detailOf(nextProject)
      }
      const moved = <T,>(list: T[], at: number): T[] => {
        const target = Math.max(0, Math.min(index, list.length - 1))
        const item = list[at]!
        const rest = list.filter((_, i) => i !== at)
        return [...rest.slice(0, target), item, ...rest.slice(target)]
      }
      const paperAt = project.papers.indexOf(id)
      if (paperAt >= 0) return commit({ ...project, papers: moved(project.papers, paperAt) })
      const group = project.relations.find((r) => r.items.some((i) => i.id === id))
      if (group === undefined) throw new Error(`关联不存在:${id}`)
      const relations = project.relations.map((r) => (r !== group
        ? r
        : { ...r, items: moved(r.items, r.items.findIndex((i) => i.id === id)) }))
      return commit({ ...project, relations })
    },

    createAttachment(projectId, attachment) {
      if (!isAbsolute(attachment.path)) throw new Error(`附件路径不是绝对路径:${attachment.path}`)
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      const nextProject = {
        ...project,
        attachments: [{ ...attachment, id: nextId('att') }, ...project.attachments],
      }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    deleteAttachment(projectId, attachmentId) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      const attachment = project.attachments.find((a) => a.id === attachmentId)
      if (!attachment) throw new Error(`附件不存在:${attachmentId}`)
      const nextProject = {
        ...project,
        attachments: project.attachments.filter((a) => a.id !== attachmentId),
      }
      projectById.set(projectId, nextProject)
      trash = [{
        id: nextId('trash'), kind: 'attachment', title: attachment.name,
        deletedAt: nowMs(), projectId, attachment,
      }, ...trash]
      return detailOf(nextProject)
    },

    createEvent(projectId, text, node) {
      return appendEvent(projectId, text, node)
    },

    createNode(projectId, label, after) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      const node: GraphNode = {
        id: nextId('node'), label, state: 'idle',
        ...placeNode(project.graph, label, after), writebacks: [],
      }
      const nextProject = {
        ...project,
        graph: {
          nodes: [...project.graph.nodes, node],
          edges: after === null
            ? project.graph.edges
            : [...project.graph.edges, [after, node.id] as [string, string]],
        },
      }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    updateNode(projectId, nodeId, patch) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      if (!project.graph.nodes.some((node) => node.id === nodeId)) {
        throw new Error(`节点不存在:${nodeId}`)
      }
      const nextProject = {
        ...project,
        graph: {
          ...project.graph,
          nodes: project.graph.nodes.map((node) => (
            node.id === nodeId ? { ...node, ...patch } : node
          )),
        },
      }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    deleteNode(projectId, nodeId) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      if (!project.graph.nodes.some((node) => node.id === nodeId)) {
        throw new Error(`节点不存在:${nodeId}`)
      }
      const nextProject = {
        ...project,
        graph: {
          nodes: project.graph.nodes.filter((node) => node.id !== nodeId),
          edges: project.graph.edges.filter(([from, to]) => from !== nodeId && to !== nodeId),
        },
      }
      projectById.set(projectId, nextProject)
      ideas = ideas.map((idea) => (
        idea.project === projectId && idea.node === nodeId
          ? updateResearchIdea(idea, { node: null }, today())
          : idea
      ))
      return detailOf(nextProject)
    },

    createConclusion(projectId, text, { chat, paper }) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      const source = chat === undefined ? MANUAL_SOURCE : chatSource(chatOf(chat).title)
      if (paper !== undefined && !byId.has(paper)) throw new Error(`论文不存在:${paper}`)
      const item: Conclusion = {
        id: nextId('concl'),
        text,
        state: 'pending',
        date: today(),
        source,
        ...(paper === undefined ? {} : { paper }),
      }
      const nextProject = { ...project, conclusionList: [...project.conclusionList, item] }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    setConclusionState(projectId, conclusionId, state) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      if (!project.conclusionList.some((conclusion) => conclusion.id === conclusionId)) {
        throw new Error(`结论不存在:${conclusionId}`)
      }
      const nextProject = {
        ...project,
        conclusionList: project.conclusionList.map((conclusion) => (
          conclusion.id === conclusionId ? { ...conclusion, state } : conclusion
        )),
      }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    verifyConclusion(projectId, node, fingerprint) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      const held = concludedNodes(project.graph).find((n) => n.id === node)
      if (held === undefined) throw new Error(`节点没有可验证的结论:${node}`)
      if (conclusionFingerprint(held) !== fingerprint) throw new Error(CONCLUSION_CHANGED)
      const entry = { node, fingerprint, date: today() }
      const nextProject = {
        ...project,
        verifiedConclusions: [...(project.verifiedConclusions ?? []).filter((v) => v.node !== node), entry],
      }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    unverifyConclusion(projectId, node) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      const rest = (project.verifiedConclusions ?? []).filter((v) => v.node !== node)
      const nextProject = { ...project }
      if (rest.length === 0) delete nextProject.verifiedConclusions
      else nextProject.verifiedConclusions = rest
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    deleteConclusion(projectId, conclusionId) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      if (!project.conclusionList.some((conclusion) => conclusion.id === conclusionId)) {
        throw new Error(`结论不存在:${conclusionId}`)
      }
      const nextProject = {
        ...project,
        conclusionList: project.conclusionList.filter((conclusion) => conclusion.id !== conclusionId),
      }
      projectById.set(projectId, nextProject)
      return detailOf(nextProject)
    },

    listInbox(params = {}) {
      const rows = inbox.filter((e) => !gone.has(e.id))
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
      gone.add(id)
      trash = [
        { id: nextId('trash'), kind: 'inbox', title: entry.title, deletedAt: nowMs(), entryId: id },
        ...trash,
      ]
    },

    readLater(id) {
      const entry = liveEntry(id)
      gone.add(id)
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
      return true
    },

    prepareInboxDownload(id) {
      const entry = downloadableEntry(id)
      const known = pageOf.get(entry.paper)
        ?? [...byId.values()].find((paper) => paper.identifier === `arXiv:${entry.vault.arxiv}`)?.id
      if (known !== undefined) return { kind: 'existing', paper: known, title: byId.get(known)!.title }
      if (entry.pdf === '') throw new Error('这一条没有原文地址')
      return { kind: 'fetch', url: entry.pdf }
    },

    completeInboxDownload(id, bytes) {
      const entry = downloadableEntry(id)
      const topics = entry.vault.topic === '' ? null : topicDir(wikiHome(wiki))
      const result = storeUpload(`${entry.title}.pdf`, bytes)
      if (result.kind === 'existing') {
        return { kind: 'existing', paper: result.paper.id, title: result.paper.title }
      }
      const source = sourceOf.get(result.paper.id)!
      inbox = inbox.map((held) => (held.id === id ? { ...held, downloaded: true, paper: source } : held))
      later = later.map((queued) => (queued.id === id ? { ...queued, paper: source } : queued))
      fillPaper(result.paper.id, remoteMetadata({
        id: entry.vault.arxiv,
        title: entry.title,
        abstract: entry.abstract,
        ...entry.vault.meta,
      }), null)
      const filing = topics === null ? null : topicProposal(
        result.paper.id,
        entry.title,
        [],
        [entry.vault.topic],
        wikiCards(wiki),
        topics,
      )
      if (filing !== null) ops.applyProposal(filing)
      return { kind: 'added', paper: result.paper.id }
    },

    listLater() {
      // Fixed-width ISO dates sort chronologically; stable sorting preserves queue order within a day.
      return [...later].sort((a, b) => b.added.localeCompare(a.added))
        .map((e) => ({
          ...structuredClone(e),
          day: dayOf(e.added, today()),
          paper: paperOf(e.paper),
          downloaded: pageOf.has(e.paper),
        }))
    },

    removeLater(id) {
      if (!later.some((x) => x.id === id)) throw new Error(`稍后阅读里没有这一条:${id}`)
      later = later.filter((x) => x.id !== id)
    },

    listWatches() {
      return watches.map((w) => structuredClone(w))
    },

    createWatch(watch) {
      watches = [{ id: nextId('watch'), ...structuredClone(watch), active: true }, ...watches]
    },

    updateWatch(id, watch) {
      const current = watches.find((item) => item.id === id)
      if (current === undefined) throw new Error(`关注不存在:${id}`)
      if (current.type !== watch.type) throw new Error('不能把主题关注改成作者关注，或把作者关注改成主题关注')
      watches = watches.map((item) => (
        item.id === id ? { id, ...structuredClone(watch), active: item.active } as Watch : item
      ))
    },

    setWatchActive(id, active) {
      if (!watches.some((w) => w.id === id)) throw new Error(`关注不存在:${id}`)
      watches = watches.map((w) => (w.id === id ? { ...w, active } : w))
    },

    deleteWatch(id) {
      if (!watches.some((w) => w.id === id)) throw new Error(`关注不存在:${id}`)
      const removedEntries = new Set(
        inbox.filter((entry) => entry.kind === 'watch' && entry.watch === id).map((entry) => entry.id),
      )
      watches = watches.filter((w) => w.id !== id)
      inbox = inbox.filter((entry) => entry.kind !== 'watch' || entry.watch !== id)
      for (const entryId of removedEntries) gone.delete(entryId)
      trash = trash.filter((item) => item.kind !== 'inbox' || !removedEntries.has(item.entryId))
    },

    deliverySettings() {
      return structuredClone(deliveryConfig)
    },

    setDeliverySettings(settings) {
      deliveryConfig = structuredClone(settings)
    },

    addInboxEntries(watchId, found, limit) {
      const watch = watches.find((w) => w.id === watchId)
      if (!watch) throw new Error(`关注不存在:${watchId}`)
      const unseen = unseenPapers(
        found, inbox.filter((entry) => entry.kind === 'watch').map((entry) => entry.vault.arxiv), byId.values(),
      )
      const added: InboxRecord[] = (limit === undefined ? unseen : unseen.slice(0, limit)).map((paper) => {
        const { topic, arxiv, meta, ...entry } = inboxFields(watch, paper)
        return {
          id: nextId('inbox'), watch: watch.id, downloaded: false, paper: '', semanticId: '', ...entry,
          vault: { topic, arxiv, meta },
        }
      })
      if (added.length === 0) return []
      const at = inbox.findIndex((entry) => entry.watch === watch.id)
      inbox = at < 0 ? [...inbox, ...added] : [...inbox.slice(0, at), ...added, ...inbox.slice(at)]
      return added.map((entry) => entry.vault.arxiv)
    },

    updateInboxEntries(watchId, found) {
      const byArxiv = new Map(found.map((paper) => [paper.id, paper]))
      let updated = 0
      inbox = inbox.map((entry) => {
        if (entry.watch !== watchId) return entry
        const paper = byArxiv.get(entry.vault.arxiv)
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
          vault: {
            ...entry.vault, meta: { ...entry.vault.meta, journalRef: paper.journalRef },
          },
        }
      })
      return updated
    },

    listDiscoveryProfiles() {
      return [...projectById.values()].filter((project) => project.status === ACTIVE_PROJECT)
        .map((project) => {
          const profile = projectDiscoveryProfile(project.id)
          const seeds = recommendationSeedIds(profile)
          const base = project.papers.filter((id) => arxivSeed(byId.get(id)) !== null).length
          const intents = projectDiscoveryIntents(project.id)
          return {
            id: project.id,
            name: project.name,
            seedCount: base,
            positiveCount: Math.max(0, seeds.positive.length - base),
            negativeCount: seeds.negative.length,
            intentCount: intents.filter((intent) => intent.enabled).length,
            lastFetchedAt: discoverySchedules.get(project.id)?.lastFetchedAt ?? null,
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
      if (!projectById.has(projectId)) throw new Error(`项目不存在:${projectId}`)
      return discoverySchedules.get(projectId)
        ?? { lastFetchedAt: null, cursor: 0, requests: {} }
    },

    setDiscoverySchedule(projectId, schedule) {
      if (!projectById.has(projectId)) throw new Error(`项目不存在:${projectId}`)
      discoverySchedules.set(projectId, schedule)
    },

    setDiscoveryIntent(projectId, intentId, action) {
      if (!projectById.has(projectId)) throw new Error(`项目不存在:${projectId}`)
      if (!projectDiscoveryIntents(projectId).some((intent) => intent.id === intentId)) {
        throw new Error(`推荐方向不存在:${intentId}`)
      }
      const held = discoveryPreferences.get(projectId)
        ?? { coreIntentId: null, disabledIntentIds: [] }
      const disabled = new Set(held.disabledIntentIds)
      if (action === 'disable') disabled.add(intentId)
      else disabled.delete(intentId)
      discoveryPreferences.set(projectId, {
        coreIntentId: action === 'set-core' ? intentId : held.coreIntentId,
        disabledIntentIds: [...disabled],
      })
    },

    addDiscoveryEntries(projectId, found: DiscoveryPaper[], limit) {
      const project = projectById.get(projectId)
      if (!project) throw new Error(`项目不存在:${projectId}`)
      const seeds = projectDiscoverySeeds(projectId)
      const seen = inbox.filter((entry) => entry.kind === 'discovery' && entry.project === projectId)
        .map((entry) => entry.vault.arxiv)
      const unseen = unseenPapers(found, seen, byId.values())
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
        semanticId: paper.semanticId,
        ...(paper.ranking === undefined ? {} : { ranking: paper.ranking }),
        vault: {
          topic: '',
          arxiv: paper.id,
          meta: { authors: paper.authors, submitted: paper.submitted, journalRef: paper.journalRef },
        },
      }))
      if (added.length > 0) inbox = [...added, ...inbox]
      return added.length
    },

    feedbackDiscovery(id, feedback) {
      const entry = liveEntry(id)
      if (entry.kind !== 'discovery') throw new Error(`这一条不是论文发现:${id}`)
      inbox = inbox.map((held) => held.id === id ? { ...held, feedback } : held)
      if (feedback !== 'more') gone.add(id)
    },

    lastFetch() {
      return fetchedAt
    },

    setLastFetch(at) {
      fetchedAt = at
    },

    wikiHome() {
      return wikiHome(wiki)
    },

    wikiAggregation(id) {
      return wikiAggregation(wiki, id, versionOf(id)!, projectNames())
    },

    wikiPaper(id) {
      if (wiki.pages[id] === undefined) throw new Error(`wiki 论文页不存在:${id}`)
      return wikiPaper(wiki, id, versionOf(id)!)
    },

    wikiCards() {
      return wikiCards(wiki)
    },

    applyProposal(proposal, producer) {
      const next = applyProposal(wiki, proposal, today(), worldOf(producer?.by ?? HUMAN))
      rederiveRows(wiki, next)
      wiki = next
    },

    checkProposal(ops, by) {
      applyProposal(wiki, { ops }, today(), worldOf(by, by === HUMAN))
    },

    describeProposal(ops) {
      return ops.map((op) => describeOp(op, wiki))
    },

    pagesWritten(ops) {
      return touchedPages({ ops }, wiki)
    },

    pageVersion(id) {
      return versionOf(id)
    },

    wikiSignals() {
      return wikiSignals(wiki, {
        projects: [...projectById.values()].map((p) => ({
          id: p.id,
          pages: [
            ...p.relations.flatMap((g) => g.items.flatMap((item) => (item.page === undefined ? [] : [item.page]))),
            ...p.graph.nodes.flatMap((n) => n.writebacks.map((w) => w.page)),
          ],
        })),
        trashed: new Set(trash.flatMap((item) => (item.kind === 'paper' ? [`${PAPER_PAGE}${item.paper.id}`] : []))),
        missingRegions: [],
      })
    },

    proposalRecords() {
      return structuredClone(proposals)
    },

    saveProposalRecords(rows) {
      proposals = structuredClone(rows)
    },

    nextProposalId() {
      return nextId('proposal')
    },

    proposalInbox() {
      return []
    },

    dropProposalInboxFile(name) {
      throw new Error(`测试数据模式没有提案收件箱:${name}`)
    },

    updateWikiPage(id, body) {
      const page = wiki.pages[id]
      if (page === undefined) throw new Error(`wiki 页不存在:${id}`)
      checkBody(id, body)
      const next = { ...wiki, pages: { ...wiki.pages, [id]: { ...page, fm: { ...page.fm, updated: today() }, body } } }
      rederiveRows(wiki, next)
      wiki = next
    },

    applyPaperWikiDraft(id, body) {
      const page = wiki.pages[id]
      if (page === undefined) throw new Error(`wiki 页不存在:${id}`)
      checkBody(id, body)
      const next = {
        ...wiki,
        pages: {
          ...wiki.pages,
          [id]: {
            ...page,
            fm: {
              ...page.fm, updated: today(), validation_state: TRUST_VALIDATION_STATE, trust_state: TRUST_TRUST_STATE,
            },
            body,
          },
        },
      }
      rederiveRows(wiki, next)
      wiki = next
    },

    proposalPages(proposal, by = HUMAN) {
      // Validation only: fixtures have no generated area and write exactly the pages named by the operation.
      applyProposal(wiki, proposal, today(), worldOf(by))
      return touchedPages(proposal, wiki)
    },

    readPages(paths) {
      return paths.map((path) => {
        // Project pages live in projectById rather than wiki.pages; snapshots use the same JSON representation.
        const held = path.startsWith(PROJECT_PATH)
          ? projectById.get(path.slice(PROJECT_PATH.length))
          : wiki.pages[path]
        return { path, text: held === undefined ? null : JSON.stringify(held) }
      })
    },

    putPages(pages) {
      const next = { ...wiki.pages }
      for (const { path, text } of pages) {
        if (path.startsWith(PROJECT_PATH)) {
          const id = path.slice(PROJECT_PATH.length)
          if (text === null) projectById.delete(id)
          else projectById.set(id, JSON.parse(text) as FixtureProject)
          continue
        }
        if (text === null) delete next[path]
        else next[path] = JSON.parse(text) as WikiData['pages'][string]
      }
      const nextWiki = { ...wiki, pages: next }
      rederiveRows(wiki, nextWiki)
      wiki = nextWiki
    },

    listTrash() {
      dropExpired()
      // Only attachments restore into another entity and become unrestorable when their original project is gone.
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
      return item?.kind === 'paper' ? item.paper.id : undefined
    },

    restoreTrash(id) {
      dropExpired()
      const item = trash.find((entry) => entry.id === id)
      if (!item) throw new Error(`垃圾桶里没有这一条:${id}`)
      if (item.kind === 'paper') {
        byId.set(item.paper.id, item.paper)
        sourceOf.set(item.paper.id, item.source)
        pageOf.set(item.source, item.paper.id)
        wiki = { ...wiki, pages: { ...wiki.pages, [PAPER_PAGE + item.paper.id]: item.page } }
        if (item.reading !== undefined) readings.set(item.paper.id, item.reading)
      }
      else if (item.kind === 'project') {
        projectById.set(item.project.id, item.project)
        if (item.project.status === FINISHED_PROJECT) archiveIdeasForProject(item.project.id)
      }
      else if (item.kind === 'inbox') gone.delete(item.entryId)
      else if (item.kind === 'idea') ideas = [structuredClone(item.idea), ...ideas]
      else {
        const project = projectById.get(item.projectId)
        if (!project) throw new Error(`项目不存在:${item.projectId}`)
        projectById.set(item.projectId, {
          ...project,
          attachments: [...project.attachments, item.attachment],
        })
      }
      trash = trash.filter((entry) => entry !== item)
    },

    purgeTrash(id) {
      dropExpired()
      if (!trash.some((entry) => entry.id === id)) throw new Error(`垃圾桶里没有这一条:${id}`)
      trash = trash.filter((entry) => entry.id !== id)
    },

    clearTrash() {
      trash = []
    },

    listFeed() {
      const first = feedEvents === null
      const seen = feedEvents ?? new Set<string>()
      for (const project of projectById.values()) {
        for (const event of project.workspace?.events ?? []) {
          const key = `${project.id}:${event.date}:${event.text}`
          if (seen.has(key)) continue
          seen.add(key)
          if (first) continue
          const day = today()
          feed = [...feed, {
            id: nextId('entry'), source: 'lab', day: dayOf(day, day), time: FEED_NOW,
            createdAt: now().toISOString(),
            body: { kind: 'runs', runs: [
              { kind: 'strong', text: `「${project.name}」` }, { kind: 'text', text: event.text.replace(/^\[agent\] /, '') },
            ] },
          }]
        }
      }
      feedEvents = seen
      return feedNewestFirst(feed, today())
    },

    appendFeed({ source, body }) {
      const day = today()
      feed = [...feed, {
        id: nextId('entry'), source, day: dayOf(day, day), time: FEED_NOW,
        createdAt: now().toISOString(), body: structuredClone(body),
      }]
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
      return chatSession(chat)
    },

    chatForPaper(paperId) {
      const found = chats.find((held) => held.paperId === paperId)
      if (found !== undefined) return chatSession(found)
      const paper = byId.get(paperId)
      if (paper === undefined) throw new Error(`论文不存在:${paperId}`)
      const created: ChatRecord = {
        id: nextId('chat'), title: paper.title, named: true, archived: false, messages: [], paperId,
      }
      chats = [created, ...chats]
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
    },

    listIdeas() {
      for (const project of projectById.values()) {
        const root = project.workspace?.kind === 'local' ? project.workspace.root : undefined
        for (const found of readWorkspaceAgentIdeas(root)) {
          const key = `${project.id}:${found.id}`
          if (takenAgentIdeas.has(key)) continue
          takenAgentIdeas.add(key)
          const idea = createResearchIdea(nextId('idea'), found.title, found.body, {
            chatTitle: found.context ?? project.name, agent: true,
          }, found.date)
          ideas = [{
            ...idea, project: project.id, archived: project.status === FINISHED_PROJECT,
            ...(found.node === undefined ? {} : { node: found.node }),
          }, ...ideas]
        }
      }
      const sorted = [...ideas]
        .sort((a, b) => b.updated.localeCompare(a.updated) || b.id.localeCompare(a.id, undefined, { numeric: true }))
      return applyOrder(sorted, ideaOrder, (idea) => idea.id).map((idea) => structuredClone(idea))
    },

    reorderIdeas(order) {
      const known = new Set(ideas.map((idea) => idea.id))
      ideaOrder = [...order].filter((id) => known.has(id))
    },

    createIdea(chatId, title, body) {
      const sourceChat = chatOf(chatId)
      const sourcePaper = sourceChat.paperId === undefined ? undefined : byId.get(sourceChat.paperId)
      const idea = createResearchIdea(nextId('idea'), title, body, {
        chatId: sourceChat.id,
        chatTitle: sourceChat.title,
        ...(sourcePaper === undefined
          ? {}
          : { paperId: sourcePaper.id, paperTitle: sourcePaper.title }),
      }, today())
      ideas = [idea, ...ideas]
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
      return structuredClone(next)
    },

    deleteIdea(id) {
      const idea = ideas.find((held) => held.id === id)
      if (idea === undefined) throw new Error(`想法不存在:${id}`)
      ideas = ideas.filter((held) => held !== idea)
      trash = [{
        id: nextId('trash'), kind: 'idea', title: idea.title, deletedAt: nowMs(), idea,
      }, ...trash]
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
      return detail
    },

    setChatArchived(id, archived) {
      const chat = chatOf(id)
      chats = chats.map((c) => (c === chat ? { ...c, archived } : c))
    },

    search(query) {
      const needle = query.trim().toLowerCase()
      if (needle === '') return []
      const index: SearchHit[] = [
        ...wikiSearchIndex(wiki),
        ...[...projectById.values()].map((p): SearchHit =>
          ({ kind: 'project', target: p.id, title: `项目:${p.name}`, meta: `${p.status} · ${p.topic}` })),
        ...chats.filter((c) => c.paperId === undefined || c.messages.length > 0).map((c): SearchHit =>
          ({ kind: 'chat', target: c.id, title: `对话:${c.title}`, meta: '对话' })),
        ...[...byId.values()].map((p): SearchHit => ({
          kind: 'paper', target: p.title, title: `论文:${p.title}`,
          meta: `${p.year ?? ''} ${p.venue}`.trim(),
        })),
      ]
      return index.filter((hit) => hit.title.toLowerCase().includes(needle)).slice(0, SEARCH_LIMIT)
    },
  }

  return withChangelog(ops, {
    load: () => changelog,
    save: (rows) => { changelog = rows },
    nextId: () => nextId('change'),
  })
}
