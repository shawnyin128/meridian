import { z } from 'zod'
import { DEFAULT_PAPER_GROUPS, PROJECT_STATUSES, READ_STATES } from './vocabulary.js'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须是 ISO 字符串')
const IsoTimestamp = z.iso.datetime()
const IsoDateTimeOffset = z.iso.datetime({ offset: true })

/**
 * A research-record row's type chip. `project` only ever marks the project-creation record; every
 * other App-written record is `note`. Agent-written records use the other six values.
 */
export const EventKindSchema = z.enum(['start', 'reopen', 'result', 'decision', 'complete', 'note', 'project'])
export type EventKind = z.infer<typeof EventKindSchema>

/**
 * One research-record row, shared by the project's own event log and its live workspace
 * projection. `kind` and `origin` are absent on a record written before those fields existed; the
 * renderer shows a record with no `kind` as `note` and no `origin` as `user`.
 */
const RecordEventSchema = z.object({
  date: IsoDate,
  text: z.string(),
  node: z.string().optional(),
  kind: EventKindSchema.optional(),
  detail: z.string().min(1).max(300).optional(),
  at: IsoDateTimeOffset.optional(),
  origin: z.enum(['agent', 'user']).optional(),
}).strict()
export type RecordEvent = z.infer<typeof RecordEventSchema>

const ProjectStatusSchema = z.enum(PROJECT_STATUSES)

/** User-authored relationship with a paper; missing values use the first vocabulary state. */
const ReadStateSchema = z.enum(READ_STATES)

/** Custom-cell value: one string for text and select columns, or a string list for multi-select. */
const PaperCellSchema = z.union([z.string(), z.array(z.string())])

/**
 * Complete cross-boundary paper record used by the table, details panel, and
 * wiki foundation card. `id` is the filename identity of the vault page used by
 * all paper methods, not the immutable source ID stored on that page. Multiple
 * pages may legally reference one source and remain independently listable,
 * editable, and removable. `noteCount` and `conclusionCount` are derived counts.
 * Bibliographic metadata can be filled from arXiv or PDF data after import and
 * corrected by the user without changing the source PDF. Legacy pages may omit
 * year and venue. `pageState` is a system-authored free string inherited from
 * vault frontmatter, while `readState` is a user-authored application enum.
 * `custom` contains values keyed by configured column and omits empty cells.
 */
export const PaperRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** User-defined short title; the UI derives a temporary one from the full title when absent. */
  shortTitle: z.string().optional(),
  authors: z.array(z.string()).optional(),
  year: z.number().int().optional(),
  venue: z.string(),
  /** Personal rating; absence means unrated. */
  rating: z.number().int().min(1).max(5).optional(),
  identifier: z.string().optional(),
  submitted: IsoDate.optional(),
  /** Abstract, omitted when the vault has none. */
  abstract: z.string().optional(),
  topics: z.array(z.string()),
  methods: z.array(z.string()),
  datasets: z.array(z.string()),
  metrics: z.array(z.string()),
  pageState: z.string(),
  readState: ReadStateSchema,
  /** Projects referencing this paper in project order, derived from project pages and not directly editable. */
  projects: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
  pageCount: z.number().int(),
  noteCount: z.number().int(),
  conclusionCount: z.number().int(),
  /** Paper-wide remark shared with the reader sidebar, omitted until written. */
  remark: z.string().optional(),
  /** Ingestion timestamp; Core derives it from the creation date for legacy pages. */
  addedAt: IsoTimestamp.optional(),
  updated: IsoDate,
  custom: z.record(z.string(), PaperCellSchema),
}).strict()

/** Project day view snaps to two-hour intervals; start cannot be 24:00 and end cannot be 00:00. */
export const TASK_SLOT_STARTS = [
  '00:00', '02:00', '04:00', '06:00', '08:00', '10:00',
  '12:00', '14:00', '16:00', '18:00', '20:00', '22:00',
] as const
export const TASK_SLOT_ENDS = [
  '02:00', '04:00', '06:00', '08:00', '10:00', '12:00',
  '14:00', '16:00', '18:00', '20:00', '22:00', '24:00',
] as const

export const TaskWindowSchema = z.object({
  start: z.enum(TASK_SLOT_STARTS),
  end: z.enum(TASK_SLOT_ENDS),
}).strict()

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  start: IsoDate,
  end: IsoDate,
  /** Optional time window; absence means all day, with cross-day bounds applying to the first and last day. */
  window: TaskWindowSchema.optional(),
  state: z.enum(['act', 'plan', 'done']),
  priority: z.enum(['p0', 'p1', 'p2']),
  /** Raw Markdown note for the task's requirements and details; absent means no note has been written. */
  note: z.string().optional(),
  /** `agent` when a coding agent added the task to the plan; absent when the user did. */
  origin: z.enum(['agent']).optional(),
}).strict()

export const MilestoneSchema = z.object({
  id: z.string(),
  date: IsoDate,
  title: z.string(),
  done: z.boolean(),
}).strict()

/** Verification bucket for a conclusion: pending, verified, or conflicting with evidence. */
export const ConclusionStateSchema = z.enum(['pending', 'verified', 'conflicting'])

/**
 * A project conclusion. `source` is the frozen provenance label and `paper` is an optional referenced paper ID.
 */
export const ConclusionSchema = z.object({
  id: z.string(),
  text: z.string(),
  state: ConclusionStateSchema,
  date: IsoDate,
  source: z.string(),
  paper: z.string().optional(),
}).strict()

/**
 * One of a project's conclusions as the Conclusions view shows it; derived by Core, never stored.
 * A node conclusion has `node` (its id is the node id), the `fingerprint` of what it holds now, and
 * `verifiedOn` once the user verified exactly that; it is `pending` until then. A legacy entry of
 * `conclusionList` has `source` and keeps its stored state. Either is `conflicting` while a Wiki claim
 * written from it, or a Wiki conflict against it, is open. `tasks` are the node's plan tasks,
 * `experiments` its evidence, and `wiki` the claims citing it, in page order.
 */
export const ProjectConclusionSchema = z.object({
  id: z.string(),
  node: z.string().optional(),
  source: z.string().optional(),
  text: z.string(),
  date: IsoDate.optional(),
  state: ConclusionStateSchema,
  fingerprint: z.string().optional(),
  verifiedOn: IsoDate.optional(),
  tasks: z.array(z.object({ id: z.string(), title: z.string() }).strict()),
  experiments: z.array(z.object({ id: z.string(), title: z.string() }).strict()),
  wiki: z.array(z.object({
    page: z.string(), title: z.string(), claim: z.string(), version: z.number().int().positive(),
  }).strict()),
}).strict()

/** Derived project conclusion counts by verification bucket. */
export const ConclusionsSchema = z.object({
  verified: z.number().int(),
  pending: z.number().int(),
  conflicting: z.number().int(),
}).strict()

/** An absolute web address; only http and https are accepted. */
export const WebUrlSchema = z.string().refine(
  (value) => /^https?:\/\//i.test(value) && URL.canParse(value),
  { message: 'expected an http(s) URL' },
)

/**
 * Related-section item. `page` is set when it resolves to a page in this vault, `url` when it
 * points at a web address and `text` is its display name; an item carries at most one of the two.
 */
export const RelationSchema = z.object({
  id: z.string(),
  text: z.string(),
  page: z.string().optional(),
  url: WebUrlSchema.optional(),
}).strict()

/** Group of related items whose `group` is a localized display label. */
export const RelationGroupSchema = z.object({
  group: z.string(),
  items: z.array(RelationSchema),
}).strict()

/**
 * Attachment. `size` is human-readable text rather than bytes and `path` is an
 * absolute local path. The vault stores only the path; legacy name-only entries omit it.
 */
export const AttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.string(),
  path: z.string().optional(),
}).strict()

/**
 * Read-only research-graph node. `x`, `y`, and `width` use viewBox units.
 * Workspace-generated nodes project agent-maintained Markdown and provenance;
 * the app displays but does not edit them. `writebacks` supports legacy pages only.
 */
export const GraphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  state: z.enum(['act', 'done', 'idle']),
  mode: z.enum(['unresolved', 'repairable', 'supported', 'dead']).optional(),
  /** Structured next action from a Lab node body; the app reads it without mutating the graph. */
  nextAction: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  markdown: z.string().optional(),
  markdownPath: z.string().optional(),
  markdownAnchor: z.string().optional(),
  writebacks: z.array(z.object({ page: z.string(), text: z.string(), date: IsoDate }).strict()),
  /** Plan task ids a coding agent linked to this node; a task belongs to at most one node. */
  tasks: z.array(z.string()).optional(),
  /** The finding an agent recorded once the node closed, with the experiments that show it. */
  conclusion: z.object({
    text: z.string(),
    date: IsoDate.optional(),
    evidence: z.array(z.object({ id: z.string(), title: z.string() }).strict()),
    /** Changes when the node is closed again or a cited experiment record changes; absent in older exports. */
    revision: z.string().optional(),
  }).strict().optional(),
}).strict()

/** One node conclusion the user verified: the node, the fingerprint of what was verified, and the day. */
export const VerifiedConclusionSchema = z.object({
  node: z.string().min(1), fingerprint: z.string().regex(/^[0-9a-f]{16}$/), date: IsoDate,
}).strict()

/**
 * Read-only DAG of a project's research nodes. `activeNodes` is the set of nodes currently in
 * progress, oldest first; each one's route is derived from branch edges rather than stored, and
 * the field may be omitted for legacy project pages.
 */
export const ResearchGraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(z.tuple([z.string(), z.string()])),
  activeNodes: z.array(z.string()).optional(),
}).strict()

/**
 * Shared execution-control projection for project surfaces. It is not a second
 * plan: tasks and research nodes remain authoritative, while this keeps only the
 * resolved data needed to explain the next action consistently.
 */
export const ProjectNextActionSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('task'),
    text: z.string(),
    task: TaskSchema.pick({
      id: true, state: true, priority: true, start: true, end: true, window: true,
    }),
  }).strict(),
  z.object({
    source: z.literal('research'),
    text: z.string(),
    node: GraphNodeSchema.pick({ id: true, label: true }),
  }).strict(),
  z.object({ source: z.literal('missing'), text: z.string() }).strict(),
])

export const ProjectControlSchema = z.object({
  next: ProjectNextActionSchema,
  blocker: z.object({ source: z.literal('manual'), text: z.string() }).strict().optional(),
}).strict()

/** A project workspace may be local or use a user-configured SSH connection. */
export const ProjectWorkspaceBindingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('local'),
    root: z.string().trim().min(1),
  }).strict(),
  z.object({
    kind: z.literal('ssh'),
    host: z.string().trim().min(1),
    path: z.string().trim().min(1),
    port: z.number().int().min(1).max(65_535).optional(),
  }).strict(),
])

/**
 * Lists one folder of an SSH host to choose a workspace in: the folder at `path`, or the remote home
 * when there is none. Like a binding it holds no credentials; OpenSSH supplies them.
 */
export const SshFoldersParamsSchema = z.object({
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65_535).optional(),
  path: z.string().trim().min(1).optional(),
}).strict()

/**
 * One folder of an SSH host: `ready` with its absolute path, its parent (null at `/`) and its
 * subfolders that are not hidden, by name; or `failed` with the reason the connection or the folder gave.
 */
export const SshFoldersSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ready'),
    path: z.string(),
    parent: z.string().nullable(),
    folders: z.array(z.object({ name: z.string(), path: z.string() }).strict()),
  }).strict(),
  z.object({ state: z.literal('failed'), issue: z.string() }).strict(),
])

/**
 * Read-only research state produced in a project directory by code or an
 * external agent. The app projects only protocol-declared surfaces; source files
 * remain in the workspace and Core never edits them for an external writer.
 */
export const ProjectWorkspaceSchema = z.object({
  kind: z.enum(['local', 'ssh']),
  root: z.string(),
  host: z.string().optional(),
  port: z.number().int().min(1).max(65_535).optional(),
  state: z.enum(['ready', 'missing', 'invalid']),
  planPath: z.string(),
  planRevision: z.string().optional(),
  graph: ResearchGraphSchema.optional(),
  graphGeneratedAt: z.string().optional(),
  graphHealth: z.enum(['ok', 'warning', 'error', 'unknown']).optional(),
  events: z.array(RecordEventSchema),
  issue: z.string().optional(),
}).strict()

/**
 * Meridian's normalized view of one agent session, not the agent's raw output.
 * `when` is the day the session ran, which the renderer localizes like every other date; step
 * `time` stays a human-readable clock reading, because it is shown exactly as the agent reported it.
 */
export const AgentSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  when: IsoDate,
  steps: z.array(z.object({ time: z.string(), text: z.string() }).strict()),
  /** Final human-readable output summary. */
  outcome: z.string(),
}).strict()

export const ProjectDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: ProjectStatusSchema,
  priority: z.enum(['p0', 'p1', 'p2']),
  /** The title of the project's topic, or DEFAULT_PROJECT_TOPIC when it has none; with several topics, the first of `topics`. */
  topic: z.string(),
  /** The titles of every topic of a project that has several, in order; absent while it has one or none. */
  topics: z.array(z.string()).optional(),
  /**
   * The Wiki topic page of each of the project's topics, in the order of their titles; null for a
   * title no topic page holds. Absent while the project has no topic.
   */
  topicPages: z.array(z.string().nullable()).optional(),
  focus: z.string(),
  /** Current blocker, omitted when the project is not blocked. */
  block: z.string().optional(),
  /** Wiki page opened by the conflict indicator, omitted when no conclusion conflicts exist. */
  conflictPage: z.string().optional(),
  start: IsoDate,
  due: IsoDate,
  /** Raw Markdown for project notes. */
  memo: z.string(),
  conclusions: ConclusionsSchema,
  /** Project conclusions in insertion order. */
  conclusionList: z.array(ConclusionSchema),
  /** Claim refs whose experiment evidence cites a conclusion, keyed by conclusion id; derived by Core, never stored. */
  conclusionClaims: z.record(z.string(), z.array(z.string())).optional(),
  /** Node and legacy conclusions, newest first; derived by Core, never stored. */
  projectConclusions: z.array(ProjectConclusionSchema).optional(),
  /** Node conclusions the user verified; stored on the project page, absent until the first one. */
  verifiedConclusions: z.array(VerifiedConclusionSchema).optional(),
  /** Derived count of referenced papers still present in the vault. */
  paperCount: z.number().int(),
  /** Paper IDs recorded on the project page, including papers currently in trash. */
  papers: z.array(z.string()),
  /** Display labels by ID for referenced papers still in the vault; `paperCount` counts these. */
  paperTitles: z.record(z.string(), z.string()),
  tasks: z.array(TaskSchema),
  /** Research node a task was given by hand, by task id; it takes precedence over the graph's own link. */
  taskNodes: z.record(z.string(), z.string()).optional(),
  milestones: z.array(MilestoneSchema),
  /** Research log in insertion order, newest last. `node` links a record to a graph node. */
  events: z.array(RecordEventSchema),
  /**
   * Newest day the project progressed: its newest research record, on the page or in the bound
   * workspace, or its newest recorded change other than a reorder or the project's own deletion.
   * Derived by Core, never stored; omitted when there is none.
   */
  lastProgress: IsoDate.optional(),
  relations: z.array(RelationGroupSchema),
  attachments: z.array(AttachmentSchema),
  graph: ResearchGraphSchema,
  agentSessions: z.array(AgentSessionSchema),
  /** Live workspace projection read by Core when bound; never written back to the Paper Wiki project page. */
  workspace: ProjectWorkspaceSchema.optional(),
}).strict()

/**
 * Project-list summary with project fields plus milestone and research-log
 * projections. Detail-only tasks, relations, attachments, graph, agent sessions,
 * and notes are omitted.
 */
export const ProjectSummarySchema = ProjectDetailSchema.pick({
  id: true, name: true, status: true, priority: true, topic: true, topics: true, topicPages: true, focus: true, block: true,
  conflictPage: true, conclusions: true, paperCount: true, lastProgress: true,
}).extend({
  /** The project's topic pages and every topic page above them; derived by Core, absent while it has no topic page. */
  topicScope: z.array(z.string()).optional(),
  /** List pages consume the shared control projection instead of reinterpreting focus, tasks, or graph state. */
  control: ProjectControlSchema,
  /** One completion value per milestone; the earliest unfinished item is next, with titles kept in details. */
  milestones: z.array(z.object({ date: IsoDate, done: z.boolean() }).strict()),
  /**
   * The three newest research records on the page or in the bound workspace, in
   * `sortRecordsNewestFirst` order reversed: newest last.
   */
  recentEvents: z.array(z.object({
    date: IsoDate, text: z.string(), origin: z.enum(['agent', 'user']).optional(),
  }).strict()),
})

/**
 * Research-overview project record with schedule, research-log, and compact
 * graph projections. Overview and project timelines share real task dates and
 * windows; project start and due remain attributes rather than synthetic tasks.
 * Areas cross for the overview's filter; paper count, conflict page, and other details do not.
 */
export const ProjectOverviewSchema = ProjectDetailSchema.pick({
  id: true, name: true, status: true, priority: true, topic: true, topics: true, topicPages: true, focus: true, block: true,
  start: true, due: true, conclusions: true,
  tasks: true, milestones: true, events: true, lastProgress: true,
}).extend({
  topicScope: ProjectSummarySchema.shape.topicScope,
  /**
   * Read-only graph summary for overview surfaces: nodes currently in progress, path health,
   * and branch counts without the full graph or Markdown.
   */
  research: z.object({
    pathState: z.enum(['empty', 'missing', 'broken', 'active']),
    activeNodes: z.array(GraphNodeSchema.pick({
      id: true, label: true, state: true, mode: true, nextAction: true,
    })),
    branches: z.object({
      active: z.number().int().min(0),
      supported: z.number().int().min(0),
      failed: z.number().int().min(0),
      shelved: z.number().int().min(0),
    }).strict(),
  }).strict(),
})

const SortKeySchema = z.enum(['addedAt', 'title', 'year', 'authors'])
const SortDirectionSchema = z.enum(['asc', 'desc'])

/**
 * Field name recognized by grouping and filtering: a built-in groupable field
 * or configured select/multi-select key. It is not an enum because configuration
 * defines the set dynamically; Core rejects unknown names.
 */
const GroupKeySchema = z.string().min(1)

/** One value of a groupable field: a paper matches it when that field carries the value. */
const FieldValueSchema = z.object({ field: GroupKeySchema, value: z.string() }).strict()

/**
 * `filter` is the search text, `facet` the picked value of the grouping, and `filters` the field
 * values the toolbar's filters hold; a listed paper matches all of them.
 */
export const ListParamsSchema = z.object({
  page: z.number().int().min(1),
  size: z.number().int().min(1).max(200),
  sort: SortKeySchema.optional(),
  direction: SortDirectionSchema.optional(),
  filter: z.string().optional(),
  facet: FieldValueSchema.optional(),
  filters: z.array(FieldValueSchema).optional(),
}).strict()

export const PapersFacetsParamsSchema = z.object({
  field: GroupKeySchema,
  filter: z.string().optional(),
  filters: z.array(FieldValueSchema).optional(),
}).strict()

/** Custom column kinds: text, single selection, and multiple selection. */
const PaperColumnTypeSchema = z.enum(['text', 'select', 'multi'])

/**
 * Paper-table column configuration. `hidden` contains hideable built-in keys;
 * `custom` defines page key, header label, type, and options; `groups` contains
 * grouping-bar keys. Column widths are session UI state. Defaults also migrate
 * older configurations that lack these fields.
 */
export const PaperColumnsSchema = z.object({
  hidden: z.array(z.string()),
  custom: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: PaperColumnTypeSchema.default('text'),
    options: z.array(z.string()).default([]),
  }).strict()),
  groups: z.array(z.string()).default([...DEFAULT_PAPER_GROUPS]),
  /** User order for non-title columns, derived from declaration order for legacy vaults. */
  order: z.array(z.string()).optional(),
}).strict()

export const PapersSetColumnsParamsSchema = z.object({ columns: PaperColumnsSchema }).strict()

/** Renames an option in its column configuration and every populated paper cell as one undoable change. */
export const PapersRenameOptionParamsSchema = z.object({
  key: z.string(), from: z.string(), to: z.string(),
}).strict()

/** Changes a column type and converts its configuration and populated cells as one undoable change. */
export const PapersSetColumnTypeParamsSchema = z.object({
  key: z.string(), type: PaperColumnTypeSchema,
}).strict()

export const PapersGetParamsSchema = z.object({ id: z.string() }).strict()

export const PapersDeleteParamsSchema = z.object({ id: z.string() }).strict()

export const PapersSourceParamsSchema = z.object({ id: z.string() }).strict()

/**
 * Upload bytes cross the renderer/Core boundary as structured-clone binary,
 * avoiding base64 expansion. The boundary rejects oversized files before they
 * can exhaust Core memory.
 */
export const MAX_PDF_UPLOAD_BYTES = 100 * 1024 * 1024

const PdfBytesSchema = z.custom<Uint8Array>(
  (value) => value instanceof Uint8Array,
  'PDF 内容必须是 Uint8Array',
).refine((value) => value.byteLength <= MAX_PDF_UPLOAD_BYTES, 'PDF 不能大于 100 MB')

export const PapersImportParamsSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  bytes: PdfBytesSchema,
}).strict()

/** Parses the metadata of paper `id` again, as it was uploaded in this run of the App. */
export const PapersRetryMetadataParamsSchema = z.object({ id: z.string() }).strict()

/** What filling the papers' publication venue and year from Semantic Scholar came to: how many papers changed. */
export const PublicationFillResultSchema = z.object({ updated: z.number().int().min(0) }).strict()

export const PaperImportResultSchema = z.object({
  kind: z.enum(['added', 'existing']),
  paper: PaperRowSchema,
}).strict()

/** Highlight rectangle in PDF page coordinates, independent of zoom. */
export const PaperHighlightRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
}).strict().refine(
  (rect) => rect.x + rect.width <= 1.000_001 && rect.y + rect.height <= 1.000_001,
  '高亮矩形不能超出页面',
)

export const PaperHighlightSchema = z.object({
  id: z.string(),
  page: z.number().int().positive(),
  quote: z.string().trim().min(1).max(20_000),
  rects: z.array(PaperHighlightRectSchema).min(1).max(200),
  color: z.enum(['yellow', 'green', 'blue', 'pink']),
  note: z.string().max(50_000),
  created: IsoDate,
  updated: IsoDate,
}).strict()

export const PaperNoteSchema = z.object({
  id: z.string(),
  page: z.number().int().positive(),
  text: z.string().trim().min(1).max(50_000),
  created: IsoDate,
  updated: IsoDate,
}).strict()

/**
 * Persistent reading state. Highlights preserve excerpts and page coordinates;
 * notes preserve page numbers; `remark` is a paper-wide note; `lastPage` records
 * reading position. This raw user state stays separate from extracted source
 * metadata and compiled Wiki knowledge.
 */
export const PaperReadingSchema = z.object({
  paperId: z.string(),
  highlights: z.array(PaperHighlightSchema),
  notes: z.array(PaperNoteSchema),
  remark: z.string().max(50_000).default(''),
  lastPage: z.number().int().positive().optional(),
}).strict()

const ReadingMutationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('highlight.add'),
    page: z.number().int().positive(),
    quote: z.string().trim().min(1).max(20_000),
    rects: z.array(PaperHighlightRectSchema).min(1).max(200),
    color: PaperHighlightSchema.shape.color,
  }).strict(),
  z.object({
    kind: z.literal('highlight.update'),
    id: z.string(),
    note: z.string().max(50_000),
    color: PaperHighlightSchema.shape.color.optional(),
  }).strict(),
  z.object({ kind: z.literal('highlight.delete'), id: z.string() }).strict(),
  z.object({
    kind: z.literal('note.add'),
    page: z.number().int().positive(),
    text: z.string().trim().min(1).max(50_000),
  }).strict(),
  z.object({
    kind: z.literal('note.update'), id: z.string(), text: z.string().trim().min(1).max(50_000),
  }).strict(),
  z.object({ kind: z.literal('note.delete'), id: z.string() }).strict(),
  z.object({ kind: z.literal('remark.set'), text: z.string().max(50_000) }).strict(),
  z.object({ kind: z.literal('progress.set'), page: z.number().int().positive() }).strict(),
])

export const PapersReadingParamsSchema = z.object({ id: z.string() }).strict()

export const PapersMutateReadingParamsSchema = z.object({
  id: z.string(),
  mutation: ReadingMutationSchema,
}).strict()

/** Why a network call failed: no network, a timeout, a rate limit, another error status, or anything else. */
export const NetFailureSchema = z.enum(['unavailable', 'timeout', 'rate-limit', 'server', 'unknown'])

/**
 * Why Core failed a call: a network failure, a file that is not a PDF, a vault write the file
 * system refused, an entity that no longer exists, a change the current state refuses, content that
 * changed since it was shown, a change with newer changes to undo first, an option or column still
 * in use, input that failed validation, a folder that is not a Meridian library, a resource still
 * busy, data a newer App wrote, a key the system credential store could not save or read back, no
 * model set up, a generation the user stopped, a failed model call, a subscription CLI that is not
 * installed, lacks options Meridian runs it with, is not signed in with the subscription or shows
 * its sign-in in a form that cannot be read, a plan whose usage limit is reached, a CLI that ran
 * past its time, model output that failed validation, or anything else.
 */
export const CallFailureSchema = z.enum([
  ...NetFailureSchema.options, 'not-pdf', 'write', 'not-found', 'refused', 'changed', 'newer-changes', 'in-use',
  'invalid', 'not-library', 'busy', 'newer-version', 'key-unsaved', 'key-unreadable', 'no-model', 'cancelled',
  'model', 'cli-missing', 'cli-unsupported', 'cli-signed-out', 'cli-sign-in-unknown', 'usage-limit', 'cli-timeout',
  'malformed-output',
])

/** What a rejected call carries across the process boundary instead of Core's error. */
export const CallRejectionSchema = z.object({ reason: CallFailureSchema }).strict()

/** The subscription CLIs a model call can run on: Claude Code (`claude`) and Codex CLI (`codex`). */
export const HarnessCliSchema = z.enum(['claude', 'codex'])

/** A reasoning effort level, as a provider or CLI names it, such as `low` or `xhigh`. */
export const HarnessEffortSchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/)

/**
 * A cost-bearing Harness action. Core prepares this plan without a model call; the renderer must
 * show its exact scope and selected model before it can exchange the one-time plan for a run.
 * Runtime budgets stay inside Core: exposing approximate token or call counts as if they were
 * reliable forecasts would make the confirmation misleading.
 */
export const HarnessPlanSchema = z.object({
  id: z.string().min(1),
  workflow: z.literal('paper-wiki'),
  targetId: z.string().min(1),
  scopeDigest: z.string().min(1),
  action: z.enum(['create', 'update']),
  label: z.string().min(1),
  scope: z.object({
    paperTitle: z.string().min(1),
    paperPages: z.number().int().min(0),
    highlights: z.number().int().min(0),
    annotatedHighlights: z.number().int().min(0),
    notes: z.number().int().min(0),
    hasRemark: z.boolean(),
    existingWikiChars: z.number().int().min(0),
  }).strict(),
  /**
   * `cli` names the subscription CLI a run on the user's plan runs on, instead of an API; `effort`
   * is the reasoning effort the run asks for, absent for the provider's or CLI's own default.
   */
  model: z.object({
    provider: z.string().min(1),
    name: z.string().min(1),
    configured: z.boolean(),
    billable: z.boolean(),
    cli: HarnessCliSchema.optional(),
    effort: HarnessEffortSchema.optional(),
  }).strict(),
  /** The output cap of a run on an API model at a reasoning effort, raised by the reasoning it may spend; absent otherwise. */
  outputLimit: z.number().int().positive().optional(),
  expiresAt: IsoTimestamp,
}).strict()

export const HarnessPrepareParamsSchema = z.object({
  workflow: z.literal('paper-wiki'),
  paperId: z.string().min(1),
}).strict()

/**
 * Starting a run requires both values the user saw in the prepared plan plus an explicit cost
 * acknowledgement. A stale, expired, reused, or altered plan is rejected by Core.
 */
export const HarnessStartParamsSchema = z.object({
  planId: z.string().min(1),
  scopeDigest: z.string().min(1),
  acknowledgeCost: z.literal(true),
}).strict()

/** Stops the Wiki run going for paper `paperId`. */
export const HarnessCancelParamsSchema = z.object({
  paperId: z.string().min(1),
}).strict()

export const HarnessCancelResultSchema = z.object({
  paperId: z.string().min(1),
  cancelled: z.literal(true),
}).strict()

/** Forgets why the last Wiki run of paper `paperId` failed. */
export const HarnessDismissFailureParamsSchema = z.object({
  paperId: z.string().min(1),
}).strict()

/** Provenance displayed during Paper Wiki proposal review. */
export const HarnessPaperWikiProvenanceSchema = z.enum([
  'paper-source', 'wiki-synthesis', 'user-insight', 'open-question',
])

export const HarnessPaperWikiReviewRowSchema = z.object({
  label: z.string().min(1).optional(),
  text: z.string().min(1),
}).strict()

export const HarnessPaperWikiReviewGroupSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  provenance: HarnessPaperWikiProvenanceSchema,
  anchors: z.array(z.string().min(1)),
  rows: z.array(HarnessPaperWikiReviewRowSchema).min(1),
}).strict()

export const HarnessPaperWikiReviewSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  emptyLabel: z.string().min(1),
  groups: z.array(HarnessPaperWikiReviewGroupSchema),
}).strict()

/** UI-neutral, Core-authored projection of a validated Paper Wiki draft. */
export const HarnessPaperWikiReviewSchema = z.object({
  schemaVersion: z.literal('meridian.paper-wiki-review.v1'),
  sections: z.array(HarnessPaperWikiReviewSectionSchema).min(1),
}).strict()

export const HarnessPaperWikiQualityDimensionIdSchema = z.enum([
  'grounding', 'separation', 'retrieval', 'mechanism', 'evidence', 'implementation', 'uncertainty',
])

export const HarnessPaperWikiQualityDimensionSchema = z.object({
  id: HarnessPaperWikiQualityDimensionIdSchema,
  passed: z.boolean(),
}).strict()

export const HarnessPaperWikiQualityFindingSchema = z.object({
  dimension: HarnessPaperWikiQualityDimensionIdSchema,
  code: z.string().min(1),
  path: z.string().min(1),
  message: z.string().min(1),
}).strict()

/** Deterministic, zero-model-call checks attached to the generated structured proposal. */
export const HarnessPaperWikiQualitySchema = z.object({
  schemaVersion: z.literal('meridian.paper-wiki-calibration.v1'),
  caseId: z.string().min(1),
  passed: z.boolean(),
  dimensions: z.array(HarnessPaperWikiQualityDimensionSchema).length(7),
  findings: z.array(HarnessPaperWikiQualityFindingSchema).max(100),
}).strict().superRefine((quality, context) => {
  const ids = quality.dimensions.map((dimension) => dimension.id)
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['dimensions'], message: 'Quality dimensions must be unique' })
  }
  for (const [index, dimension] of quality.dimensions.entries()) {
    const hasFinding = quality.findings.some((finding) => finding.dimension === dimension.id)
    if (dimension.passed === hasFinding) {
      context.addIssue({
        code: 'custom', path: ['dimensions', index, 'passed'],
        message: 'Dimension status must match its findings',
      })
    }
  }
  const expectedPassed = quality.findings.length === 0
    && quality.dimensions.every((dimension) => dimension.passed)
  if (quality.passed !== expectedPassed) {
    context.addIssue({ code: 'custom', path: ['passed'], message: 'Overall status must match findings' })
  }
})

export const HarnessPaperWikiDraftSchema = z.object({
  id: z.string().min(1),
  targetId: z.string().min(1),
  action: z.enum(['create', 'update']),
  body: z.string().min(1).max(2_000_000),
  review: HarnessPaperWikiReviewSchema.optional(),
  quality: HarnessPaperWikiQualitySchema.optional(),
}).strict()

export const HarnessPendingPaperWikiParamsSchema = z.object({
  paperId: z.string().min(1),
}).strict()

export const HarnessPendingPaperWikiResultSchema = z.object({
  proposal: HarnessPaperWikiDraftSchema,
  generatedAt: IsoTimestamp,
  stale: z.boolean(),
}).strict().nullable()

export const HarnessRunReceiptSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  workflow: z.literal('paper-wiki'),
  targetId: z.string().min(1),
  startedAt: IsoTimestamp,
  state: z.enum(['accepted', 'demo-complete', 'proposal-ready']),
  message: z.string().min(1),
  proposal: HarnessPaperWikiDraftSchema.optional(),
  /** Why the proposal's audit record could not be written; the proposal itself is ready. */
  warning: CallFailureSchema.optional(),
}).strict()

export const HarnessApplyPaperWikiParamsSchema = z.object({
  proposalId: z.string().min(1),
  body: z.string().min(1).max(2_000_000),
}).strict()

export const HarnessApplyPaperWikiResultSchema = z.object({
  proposalId: z.string().min(1),
  wikiId: z.string().min(1),
  appliedAt: IsoTimestamp,
  /** The change entry the Wiki write recorded, the one `changelog.undo` takes to undo it. */
  change: z.string(),
  /** Why the audit record of the applied proposal could not be written; the Wiki page is written. */
  warning: CallFailureSchema.optional(),
}).strict()

export const HarnessPaperWikiRejectionReasonSchema = z.enum([
  'source-inaccurate',
  'synthesis-unhelpful',
  'missing-important',
  'weak-grounding',
  'poor-structure',
  'other',
])

export const HarnessPaperWikiRejectionFeedbackSchema = z.object({
  reasons: z.array(HarnessPaperWikiRejectionReasonSchema).min(1).max(6)
    .refine((reasons) => new Set(reasons).size === reasons.length, 'Rejection reasons must be unique'),
  note: z.string().trim().min(1).max(500).optional(),
}).strict()

export const HarnessRejectPaperWikiParamsSchema = z.object({
  proposalId: z.string().min(1),
  feedback: HarnessPaperWikiRejectionFeedbackSchema.optional(),
}).strict()

export const HarnessRejectPaperWikiResultSchema = z.object({
  proposalId: z.string().min(1),
  rejectedAt: IsoTimestamp,
  /** Why the audit record of the rejection could not be written; the proposal is discarded. */
  warning: CallFailureSchema.optional(),
}).strict()

export const HarnessModelProviderSchema = z.enum([
  'openai',
  'anthropic',
  'google-gemini',
  'openai-compatible',
])

export const HarnessModelProtocolSchema = z.enum([
  'responses',
  'chat-completions',
  'messages',
  'generate-content',
])

/**
 * The reasoning efforts each API provider's LangChain integration passes on, lowest first: OpenAI's
 * `reasoning.effort` (the `openai` SDK's `ReasoningEffort`), Anthropic's `output_config.effort`
 * (langchain-anthropic's `reasoning_effort`) and Gemini's `thinking_level` (langchain-google-genai's
 * `reasoning_effort`). An OpenAI-compatible service is offered none.
 */
export const HARNESS_API_EFFORTS: Readonly<Record<z.infer<typeof HarnessModelProviderSchema>, readonly string[]>> = {
  openai: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  anthropic: ['low', 'medium', 'high', 'xhigh', 'max'],
  'google-gemini': ['minimal', 'low', 'medium', 'high'],
  'openai-compatible': [],
}

/**
 * A model that runs on the user's own signed-in CLI instead of an API key. `model` names the CLI's
 * model for the call and `effort` its reasoning effort; without them the CLI uses its own defaults.
 */
export const HarnessCliModelSchema = z.object({
  source: z.literal('cli'),
  cli: HarnessCliSchema,
  model: z.string().trim().min(1).max(200).optional(),
  effort: HarnessEffortSchema.optional(),
}).strict()

/** The model a subscription CLI runs, passed to its model option; '' runs the CLI's own default. */
export const HarnessSubscriptionModelSchema = z.string().trim().max(200)
  .regex(/^(?:[A-Za-z0-9][\w.:@/[\]-]*)?$/, '模型名含有不允许的字符')

/**
 * The subscription choice as older Apps read it: `active` is the CLI the default model runs on, or
 * null while it runs on an API profile, and `models` holds the model each CLI runs.
 */
export const HarnessSubscriptionSettingsSchema = z.object({
  active: HarnessCliSchema.nullable(),
  models: z.object({ claude: HarnessSubscriptionModelSchema, codex: HarnessSubscriptionModelSchema }).strict(),
  /** Why the saved choice could not be loaded; no model source is set up until a choice is saved again. */
  error: CallFailureSchema.optional(),
}).strict()

/** Makes subscription CLI `cli` the model source, running `model` at reasoning effort `effort`, or at its own default without one. */
export const HarnessUpdateSubscriptionParamsSchema = z.object({
  cli: HarnessCliSchema,
  model: HarnessSubscriptionModelSchema,
  effort: HarnessEffortSchema.optional(),
}).strict()

/** The reasoning efforts a model accepts, lowest first, and the one it runs at by default when its CLI names it. */
export const HarnessModelEffortsSchema = z.object({
  levels: z.array(HarnessEffortSchema).max(20),
  default: HarnessEffortSchema.optional(),
}).strict()

export const HarnessSubscriptionStatusParamsSchema = z.object({ cli: HarnessCliSchema }).strict()

/** A model a configured source offers, by the ID a run names it by (`''` a CLI's own default), with the reasoning efforts it takes. */
export const HarnessSourceModelSchema = z.object({
  id: z.string().max(200),
  efforts: HarnessModelEffortsSchema,
}).strict()

/**
 * The models configured source `source` offers, as Core read them for the session: the source's
 * default model first, then the others the source lists. `error` says why the list could not be
 * read, the default model then the only one.
 */
export const HarnessSourceModelsSchema = z.object({
  source: z.string().min(1).max(320),
  models: z.array(HarnessSourceModelSchema).min(1).max(500),
  error: CallFailureSchema.optional(),
}).strict()
export const HarnessSourceModelsParamsSchema = z.object({ source: z.string().min(1).max(320) }).strict()

/**
 * What Core finds of one subscription CLI on this machine: not installed; installed in `version`
 * (null when it cannot be read) but unsupported, lacking options Meridian runs it with; or
 * installed, signed in with a subscription, in another way such as an API key, not at all, or in a
 * way that cannot be read, and accepting `models` besides its own default. `efforts` holds the
 * reasoning efforts each model accepts, by model, `''` standing for the CLI's own default model and
 * any model it does not list.
 */
export const HarnessSubscriptionStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('missing') }).strict(),
  z.object({ state: z.literal('unsupported'), version: z.string().min(1).max(100).nullable() }).strict(),
  z.object({
    state: z.literal('found'),
    version: z.string().min(1).max(100).nullable(),
    signIn: z.enum(['subscription', 'other', 'signed-out', 'unknown']),
    models: z.array(z.string().min(1).max(200)).max(50),
    efforts: z.record(z.string().max(200), HarnessModelEffortsSchema),
  }).strict(),
])

export const HarnessModelProfileSchema = z.object({
  provider: HarnessModelProviderSchema,
  protocol: HarnessModelProtocolSchema,
  baseUrl: z.string().url(),
  model: z.string().max(200),
  authentication: z.enum(['api-key', 'none']),
  apiKeyConfigured: z.boolean(),
  apiKeyLastFour: z.string().min(1).max(4).optional(),
  configured: z.boolean(),
}).strict()

/**
 * Where a configured model runs: on an API profile, named by the key Core keeps it under (its
 * provider, or `openai-compatible:<base URL>` for a compatible service), or on a subscription CLI.
 */
export const HarnessModelSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('api'), profile: z.string().min(1).max(300) }).strict(),
  z.object({ kind: z.literal('cli'), cli: HarnessCliSchema }).strict(),
])

/**
 * A configured model source, one per source: `id` is the source's own id (`api:<profile key>` or
 * `cli:<cli>`), `source` where its models run, `model` the model a run uses unless a chat picks
 * another, `''` running a CLI's own default, and `effort` the reasoning effort a run of that model
 * uses unless a chat picks another, absent for the provider's or CLI's own. `configured` says whether
 * its runs go ahead as set up: an API source's profile exists and has a key or needs none.
 */
export const HarnessModelEntrySchema = z.object({
  id: z.string().min(1).max(320),
  source: HarnessModelSourceSchema,
  model: z.string().max(200),
  effort: HarnessEffortSchema.optional(),
  configured: z.boolean(),
}).strict()

/**
 * One configured source in the order sources are shown: the API providers (OpenAI, Anthropic, Google
 * Gemini, then each OpenAI-compatible service by base URL), then the Claude subscription, then the
 * ChatGPT one. An API source names its `provider`, and a compatible one its `host`. `entries` holds
 * the source's configuration by id, which is also `defaultEntry`.
 */
export const HarnessModelSourceGroupSchema = z.object({
  source: HarnessModelSourceSchema,
  provider: HarnessModelProviderSchema.optional(),
  host: z.string().min(1).max(300).optional(),
  entries: z.array(z.string().min(1).max(320)).min(1),
  defaultEntry: z.string().min(1).max(320),
}).strict()

/**
 * The model settings. The top-level profile fields, `profiles` and `subscription` are the API
 * profiles and the subscription choice as older Apps read them, kept in step with the default source.
 * `models` lists the configured sources, one each; `defaultModel` is the id of the one that answers
 * new chats and every other model feature, or null while none is; `sources` lists `models` in the
 * order sources are shown.
 */
export const HarnessModelSettingsSchema = HarnessModelProfileSchema.extend({
  profiles: z.array(HarnessModelProfileSchema).max(100),
  subscription: HarnessSubscriptionSettingsSchema,
  /** Why the saved model configuration could not be loaded as it was. */
  error: CallFailureSchema.optional(),
  models: z.array(HarnessModelEntrySchema).max(100),
  defaultModel: z.string().min(1).max(320).nullable(),
  sources: z.array(HarnessModelSourceGroupSchema),
  /** Why the model list, or some of the models in it, could not be read; the others keep showing. */
  modelsError: CallFailureSchema.optional(),
}).strict()

export const HarnessModelConnectionFailureSchema = z.enum([
  'configuration',
  'authentication',
  'model-or-endpoint',
  'rate-limit',
  'timeout',
  'unavailable',
  'provider',
  'unknown',
  'cli-missing',
  'cli-unsupported',
  'cli-signed-out',
  'cli-sign-in-unknown',
  'cli-timeout',
  'cli-usage-limit',
  'cli-model-unavailable',
])

const CliVersionSchema = z.string().trim().min(1).max(100)

/**
 * A model connection check's result. `modelCalls` is 0 for a check that failed before its model
 * call. `maxOutputTokens` is an API check's output cap, which a subscription CLI's call cannot set;
 * `version` is that CLI's version, for display.
 */
export const HarnessModelConnectionCheckResultSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('connected'),
    version: CliVersionSchema.optional(),
    modelCalls: z.union([z.literal(0), z.literal(1)]),
    maxOutputTokens: z.literal(1).optional(),
  }).strict(),
  z.object({
    state: z.literal('failed'),
    reason: HarnessModelConnectionFailureSchema,
    detail: z.string().trim().min(1).max(500),
    version: CliVersionSchema.optional(),
    modelCalls: z.union([z.literal(0), z.literal(1)]),
    maxOutputTokens: z.literal(1).optional(),
  }).strict(),
])

const HarnessHttpUrlSchema = z.string().trim().url().refine((value) => {
  const url = new URL(value)
  if (url.protocol === 'https:') return true
  if (url.protocol !== 'http:') return false
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}, { message: '远程模型接口必须使用 HTTPS；HTTP 仅限本机地址' })

export const HarnessModelSettingsUpdateSchema = z.object({
  provider: HarnessModelProviderSchema,
  protocol: HarnessModelProtocolSchema,
  baseUrl: HarnessHttpUrlSchema,
  model: z.string().trim().max(200),
  authentication: z.enum(['api-key', 'none']),
  apiKey: z.string().trim().min(1).max(20_000).optional(),
  clearApiKey: z.boolean().optional(),
  /** The reasoning effort the profile's runs ask for; without it they run at the provider's own default. */
  effort: HarnessEffortSchema.optional(),
}).strict()
  .refine((value) => !(value.apiKey !== undefined && value.clearApiKey === true), {
    message: '不能同时设置和清除 API Key',
  })
  .refine((value) => value.effort === undefined || HARNESS_API_EFFORTS[value.provider].includes(value.effort), {
    path: ['effort'], message: '这个模型服务不接受这一推理强度',
  })
  .superRefine((value, context) => {
    const officialProviders: Partial<Record<z.infer<typeof HarnessModelProviderSchema>, {
      baseUrl: string
      protocol: z.infer<typeof HarnessModelProtocolSchema>
    }>> = {
      openai: { baseUrl: 'https://api.openai.com/v1', protocol: 'responses' },
      anthropic: { baseUrl: 'https://api.anthropic.com', protocol: 'messages' },
      'google-gemini': {
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        protocol: 'generate-content',
      },
    }
    const official = officialProviders[value.provider]
    if (official !== undefined && value.baseUrl.replace(/\/+$/, '') !== official.baseUrl) {
      context.addIssue({
        code: 'custom', path: ['baseUrl'], message: '官方模型服务的接口地址不可修改',
      })
    }
    if (official !== undefined && value.protocol !== official.protocol) {
      context.addIssue({
        code: 'custom', path: ['protocol'], message: '官方模型服务的调用协议不可修改',
      })
    }
    if (value.provider === 'openai-compatible'
      && !['responses', 'chat-completions'].includes(value.protocol)) {
      context.addIssue({
        code: 'custom', path: ['protocol'], message: 'OpenAI 兼容服务必须使用 Responses 或 Chat Completions 协议',
      })
    }
    if (value.provider !== 'openai-compatible' && value.authentication !== 'api-key') {
      context.addIssue({
        code: 'custom', path: ['authentication'], message: '官方模型服务必须使用 API Key',
      })
    }
  })

/**
 * Where a model to save runs: an API connection, saved on its provider's or endpoint's profile with
 * its key the way a model settings update saves it, or a subscription CLI.
 */
export const HarnessModelSourceInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('api'),
    provider: HarnessModelProviderSchema,
    protocol: HarnessModelProtocolSchema,
    baseUrl: HarnessHttpUrlSchema,
    authentication: z.enum(['api-key', 'none']),
    apiKey: z.string().trim().min(1).max(20_000).optional(),
    clearApiKey: z.boolean().optional(),
  }).strict(),
  z.object({ kind: z.literal('cli'), cli: HarnessCliSchema }).strict(),
])

/**
 * Configures model source `source`, whose runs use model `model` (a CLI's `''` running its own
 * default) at reasoning effort `effort`, or at the provider's or CLI's own default without one,
 * unless a chat picks others. A source is configured once; the first one becomes the default.
 */
export const HarnessAddModelParamsSchema = z.object({
  source: HarnessModelSourceInputSchema,
  model: z.string().trim().max(200),
  effort: HarnessEffortSchema.optional(),
}).strict()

/** Saves configured source `id` anew, as configuring it would; `source` names that same source. */
export const HarnessUpdateModelParamsSchema = HarnessAddModelParamsSchema.extend({
  id: z.string().min(1).max(320),
}).strict()

/** Removes configured source `id`; when it was the default, the first source left that can run, in source order, becomes the default. */
export const HarnessRemoveModelParamsSchema = z.object({ id: z.string().min(1).max(320) }).strict()

/** Makes configured source `id` the default. */
export const HarnessSetDefaultModelParamsSchema = z.object({ id: z.string().min(1).max(320) }).strict()

/** Checks configured source `model` at its own model, or the default source without one. */
export const HarnessModelConnectionCheckParamsSchema = z.object({ model: z.string().min(1).max(320).optional() }).strict()

/**
 * Writable paper fields. Users can correct bibliographic frontmatter without
 * changing the immutable PDF and maintain read state and custom cells. Topics
 * are Wiki memberships: Core refuses a `topics` patch, and `papers.setTopic`
 * changes them. `pageState`, timestamps, counts, and page identity remain
 * system-owned. `custom` is a cell patch keyed by column, with null clearing a cell.
 */
const PaperFieldsSchema = z.object({
  title: z.string().trim().min(1).max(2_000),
  shortTitle: z.string().trim().max(300).nullable(),
  authors: z.array(z.string().trim().min(1).max(300)).max(200),
  year: z.number().int().min(1000).max(3000).nullable(),
  venue: z.string().trim().max(500),
  rating: z.number().int().min(1).max(5).nullable(),
  identifier: z.string().trim().max(500).nullable(),
  submitted: IsoDate.nullable(),
  topics: PaperRowSchema.shape.topics,
  readState: PaperRowSchema.shape.readState,
  custom: z.record(z.string(), PaperCellSchema.nullable()),
}).strict()

/** Merges a custom-cell patch into current values without changing omitted cells. */
export const PapersUpdateParamsSchema = z.object({
  id: z.string(),
  patch: PaperFieldsSchema.partial(),
}).strict()

/** Files a paper under (`member` true) or unfiles it from the Wiki topic page titled `topic`, as one undoable change. */
export const PapersSetTopicParamsSchema = z.object({
  id: z.string(),
  topic: z.string().trim().min(1).max(300),
  member: z.boolean(),
}).strict()

export const ProjectGetParamsSchema = z.object({ id: z.string() }).strict()

/** `binding: null` disconnects the project without deleting `.meridian/` from the workspace. */
export const ProjectBindWorkspaceParamsSchema = z.object({
  id: z.string(),
  binding: ProjectWorkspaceBindingSchema.nullable(),
}).strict()

/** Project creation accepts only a name; Core supplies all initial values. */
export const ProjectCreateParamsSchema = z.object({ name: z.string() }).strict()

export const ProjectDeleteParamsSchema = z.object({ id: z.string() }).strict()

/**
 * Writable project fields; `block: null` clears the blocker. `topics` sets every topic at once, in
 * order, by title, and an empty list leaves the project with none.
 */
const ProjectFieldsSchema = ProjectDetailSchema.omit({
  id: true, tasks: true, taskNodes: true, milestones: true, events: true, relations: true, attachments: true,
  conclusions: true, conclusionList: true, conclusionClaims: true, projectConclusions: true, verifiedConclusions: true,
  paperCount: true, papers: true,
  paperTitles: true, graph: true, agentSessions: true, block: true,
  conflictPage: true, workspace: true, lastProgress: true, topic: true, topics: true, topicPages: true,
}).extend({
  block: z.string().trim().min(1).max(500).nullable(),
  topics: z.array(z.string().trim().min(1).max(300))
    .refine((topics) => new Set(topics).size === topics.length, { message: '同一个主题只能有一个' }),
})

export const ProjectUpdateParamsSchema = z.object({
  id: z.string(),
  patch: ProjectFieldsSchema.partial(),
}).strict()

/**
 * Writable task and milestone fields exclude `id`, which is assigned by Core on
 * creation and used only to select the record during updates.
 */
const TaskFieldsSchema = TaskSchema.omit({ id: true, origin: true })
const MilestoneFieldsSchema = MilestoneSchema.omit({ id: true })

export const ProjectCreateTaskParamsSchema = z.object({
  projectId: z.string(),
  task: TaskFieldsSchema,
}).strict()

export const ProjectUpdateTaskParamsSchema = z.object({
  projectId: z.string(),
  taskId: z.string(),
  /** `window: null` changes a timed task back to all day; omission preserves the current value. */
  patch: TaskFieldsSchema.partial().extend({ window: TaskWindowSchema.nullable().optional() }),
}).strict()

export const ProjectDeleteTaskParamsSchema = z.object({
  projectId: z.string(),
  taskId: z.string(),
}).strict()

/** Reorders a project's tasks to `order`, a permutation of its current task ids: its one stored order. */
export const ProjectReorderTasksParamsSchema = z.object({
  projectId: z.string(),
  order: z.array(z.string()),
}).strict()

/** Gives a task a research node by hand; `nodeId: null` takes that away, leaving the graph's own link. */
export const ProjectSetTaskNodeParamsSchema = z.object({
  projectId: z.string(),
  taskId: z.string(),
  nodeId: z.string().nullable(),
}).strict()

export const ProjectCreateMilestoneParamsSchema = z.object({
  projectId: z.string(),
  milestone: MilestoneFieldsSchema,
}).strict()

export const ProjectUpdateMilestoneParamsSchema = z.object({
  projectId: z.string(),
  milestoneId: z.string(),
  patch: MilestoneFieldsSchema.partial(),
}).strict()

export const ProjectDeleteMilestoneParamsSchema = z.object({
  projectId: z.string(),
  milestoneId: z.string(),
}).strict()

/** Adds a related item with group and name plus an optional target aggregation page or web address. */
const RelationFieldsSchema = z.object({
  group: z.string(), text: z.string(), page: z.string().optional(), url: WebUrlSchema.optional(),
}).strict()
const AttachmentFieldsSchema = AttachmentSchema.omit({ id: true }).extend({ path: z.string().min(1) })

export const ProjectCreateRelationParamsSchema = z.object({
  projectId: z.string(),
  relation: RelationFieldsSchema,
}).strict()

export const ProjectDeleteRelationParamsSchema = z.object({
  projectId: z.string(),
  relationId: z.string(),
}).strict()

/** Replaces a relation item's name and target; the item keeps its id, group and position. */
export const ProjectUpdateRelationParamsSchema = z.object({
  projectId: z.string(),
  relationId: z.string(),
  relation: RelationFieldsSchema.omit({ group: true }),
}).strict()

/** Links or unlinks a paper from a project using the paper-page ID. */
export const ProjectPaperParamsSchema = z.object({
  projectId: z.string(),
  paperId: z.string(),
}).strict()

/**
 * Moves one chip of the relations section to `index` within its own row: a linked paper by its
 * paper id, or a relation item by its relation id.
 */
export const ProjectMoveRelationParamsSchema = z.object({
  projectId: z.string(),
  id: z.string(),
  index: z.number().int().min(0),
}).strict()

/**
 * Sets the manual display order for the project list: ids not named keep their existing relative
 * order after the ones that are. Unknown ids are accepted and simply ignored.
 */
export const ProjectReorderParamsSchema = z.object({
  order: z.array(z.string()),
}).strict()

export const ProjectCreateAttachmentParamsSchema = z.object({
  projectId: z.string(),
  attachment: AttachmentFieldsSchema,
}).strict()

export const ProjectDeleteAttachmentParamsSchema = z.object({
  projectId: z.string(),
  attachmentId: z.string(),
}).strict()

/** Confirmed stable author identity from an external scholarly graph, with a frozen affiliation snapshot. */
/**
 * Where an author identity comes from; its `id` only means something within that source. Only
 * Semantic Scholar identities are created now; `openalex` remains on watches saved before, and
 * those are fetched by name.
 */
export const AuthorSourceSchema = z.enum(['semantic-scholar', 'openalex'])

export const AuthorIdentitySchema = z.object({
  source: AuthorSourceSchema,
  id: z.string().trim().min(1),
  affiliations: z.array(z.string().trim().min(1)),
}).strict()

const WatchBaseSchema = {
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
}

/**
 * A watch used to collect papers. Legacy author watches may contain only a name;
 * new watches add `identity` after disambiguation and then fetch by stable author
 * ID rather than fuzzy name. Identity snapshots belong to app state, not the Paper Wiki.
 */
export const WatchSchema = z.discriminatedUnion('type', [
  z.object({ ...WatchBaseSchema, type: z.literal('topic') }).strict(),
  z.object({
    ...WatchBaseSchema,
    type: z.literal('author'),
    identity: AuthorIdentitySchema.optional(),
  }).strict(),
])

const WatchFieldsSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('topic'), name: z.string() }).strict(),
  z.object({
    type: z.literal('author'),
    name: z.string(),
    identity: AuthorIdentitySchema.optional(),
  }).strict(),
])

/** A network call that failed, with its reason; watch suggestions answer with it. */
export const NetFailedSchema = z.object({ kind: z.literal('failed'), reason: NetFailureSchema }).strict()

/** Why an author search failed: a network failure, or no saved Semantic Scholar key to search with. */
export const AuthorSearchFailureSchema = z.enum([...NetFailureSchema.options, 'no-key'])

/** A failed author search, with its reason. */
export const AuthorSearchFailedSchema = z.object({ kind: z.literal('failed'), reason: AuthorSearchFailureSchema }).strict()

/** An author search result, projected to the fields needed for disambiguation and selection. */
export const AuthorCandidateSchema = z.object({
  source: AuthorSourceSchema,
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  affiliations: z.array(z.string().trim().min(1)),
  paperCount: z.number().int().min(0),
  citationCount: z.number().int().min(0),
  hIndex: z.number().int().min(0),
}).strict()

/** A topic inferred from relevant scholarly records, before the user chooses to create a watch. */
export const WatchTopicSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  relatedPapers: z.number().int().min(0),
}).strict()

/**
 * A suggested author: a stable identity ranked by topical relevance and public impact, or, when the
 * papers came from arXiv, which lists authors by name only, just the name.
 */
export const WatchAuthorSuggestionSchema = z.union([
  AuthorCandidateSchema.extend({ relatedPapers: z.number().int().min(1) }).strict(),
  z.object({ name: z.string().trim().min(1), relatedPapers: z.number().int().min(1) }).strict(),
])

/** Transient, read-only suggestions. Nothing becomes a watch until the user confirms it. */
export const WatchSuggestionResultSchema = z.object({
  topics: z.array(WatchTopicSuggestionSchema).max(8),
  authors: z.array(WatchAuthorSuggestionSchema).max(8),
  paperCount: z.number().int().min(0),
  /** The source could not be reached, so these are the last suggestions made for the same request. */
  stale: z.boolean().optional(),
}).strict()

export const RecommendationReasonSchema = z.object({
  kind: z.enum(['watch', 'project', 'intent', 'source', 'wiki', 'seed', 'feedback']),
  label: z.string().trim().min(1).max(500),
  paperId: z.string().optional(),
}).strict()

/** A stream that lists an inbox entry: a watch, or a project's discovery, by id, with the group label it shows under. */
export const InboxStreamSchema = z.object({
  kind: z.enum(['watch', 'discovery']),
  id: z.string(),
  source: z.string(),
}).strict()

/**
 * Inbox candidate. `kind` distinguishes deterministic watch matches from
 * personalized discovery; legacy records migrate to watch matches. `watch` and
 * `project` identify the stream that delivered it first, `source` freezes its
 * group label, and `also` lists every other stream that delivered the same
 * paper, in order. `reasons` contains structured Core rationale from all of
 * them, and `rec` remains for legacy compatibility. Feedback and ranking
 * metadata stay in app state.
 */
export const InboxEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(['watch', 'discovery']).default('watch'),
  watch: z.string(),
  project: z.string().default(''),
  source: z.string(),
  title: z.string(),
  authors: z.string(),
  venue: z.string(),
  abstract: z.string(),
  rec: z.string(),
  reasons: z.array(RecommendationReasonSchema).default([]),
  also: z.array(InboxStreamSchema).optional(),
  feedback: z.enum(['more', 'less', 'known']).optional(),
  downloaded: z.boolean(),
  paper: z.string(),
  pdf: z.string(),
  ranking: z.object({
    relevance: z.number().min(0).max(1),
    published: z.boolean(),
    citationCount: z.number().int().min(0),
    influentialCitationCount: z.number().int().min(0),
    submitted: IsoDate,
  }).strict().optional(),
}).strict()

/** Entries of one stream kind, of the one watch or project among them when named, which then sort as one group. */
export const InboxListParamsSchema = z.object({
  kind: z.enum(['watch', 'discovery']).optional(),
  watch: z.string().optional(),
  project: z.string().optional(),
  sort: z.enum(['recommended', 'latest', 'published', 'impact']).optional(),
}).strict()

export const DiscoveryIntentSchema = z.object({
  id: z.string(),
  label: z.string(),
  core: z.boolean(),
  enabled: z.boolean(),
  seedCount: z.number().int().min(0),
  seeds: z.array(z.object({ id: z.string(), title: z.string() }).strict()),
}).strict()

export const DiscoveryProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  seedCount: z.number().int().min(0),
  positiveCount: z.number().int().min(0),
  negativeCount: z.number().int().min(0),
  intentCount: z.number().int().min(0),
  lastFetchedAt: z.number().int().nullable(),
  intents: z.array(DiscoveryIntentSchema),
}).strict()

export const DiscoveryFetchParamsSchema = z.object({
  projectId: z.string().optional(),
  force: z.boolean().optional(),
}).strict()
export const DiscoveryFetchResultSchema = z.object({
  projects: z.number().int().min(0),
  intents: z.number().int().min(0),
  added: z.number().int().min(0),
  deferredProjects: z.number().int().min(0),
  cachedIntents: z.number().int().min(0),
  failedIntents: z.number().int().min(0),
  /** True when no project in the run's scope had a paper left to deliver, none was put off and no direction failed. */
  nothingNew: z.boolean(),
  /** The latest time a project in the run's scope was refreshed, or null if none ever was. */
  lastFetchedAt: z.number().int().nullable(),
}).strict()
export const DiscoveryIntentUpdateParamsSchema = z.object({
  projectId: z.string(),
  intentId: z.string(),
  action: z.enum(['set-core', 'enable', 'disable']),
}).strict()
export const DiscoveryFeedbackParamsSchema = z.object({
  id: z.string(), feedback: z.enum(['more', 'less', 'known']),
}).strict()

/**
 * Recommendation settings shared by watch and project-discovery streams: how many new papers one run
 * delivers, and how many cards each watch or project shows after a refresh, absent in settings an
 * older App saved, which then read as the default.
 */
export const DeliverySettingsSchema = z.object({
  maxItemsPerRun: z.number().int().min(1).max(100),
  maxShownPerScope: z.number().int().min(1).max(100).optional(),
}).strict()

export const DEFAULT_DELIVERY_SETTINGS = {
  maxItemsPerRun: 10, maxShownPerScope: 20,
} satisfies z.infer<typeof DeliverySettingsSchema>

/**
 * Read-later entry. `source` is frozen when queued; `added` is the queue date and
 * `day` is its relative date section. `downloaded` means a vault page references
 * the source and enables reading. `paper` is that page ID, or the source ID until
 * a page exists. `pdf` preserves the remote source URL for pre-import download.
 */
export const LaterEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  added: IsoDate,
  day: z.string(),
  authors: z.string(),
  venue: z.string(),
  abstract: z.string(),
  downloaded: z.boolean(),
  paper: z.string(),
  pdf: z.string().optional(),
}).strict()

export const InboxDismissParamsSchema = z.object({ id: z.string() }).strict()

export const InboxReadLaterParamsSchema = z.object({ id: z.string() }).strict()

export const InboxDownloadParamsSchema = z.object({ id: z.string() }).strict()

/** Which watch to fetch; without one, every active watch. */
export const InboxFetchParamsSchema = z.object({ watchId: z.string().optional() }).strict()

/** Why the PDF of an inbox entry could not be fetched, or, once fetched, could not be written into the vault. */
export const InboxDownloadFailureSchema = z.enum([...NetFailureSchema.options, 'not-pdf', 'write'])

/**
 * Import result. `added` means a new page was written; `existing` means a page
 * already referenced the source and no write occurred. Both return the page ID;
 * `existing` also returns the authoritative vault title for user messaging.
 * `failed` means the PDF could not be fetched or stored.
 */
export const InboxDownloadResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('added'), paper: z.string() }).strict(),
  z.object({ kind: z.literal('existing'), paper: z.string(), title: z.string() }).strict(),
  z.object({ kind: z.literal('failed'), reason: InboxDownloadFailureSchema }).strict(),
])

export const LaterRemoveParamsSchema = z.object({ id: z.string() }).strict()

/** Watch creation accepts kind and name; Core assigns the ID and enables it. */
export const WatchCreateParamsSchema = z.object({ watch: WatchFieldsSchema }).strict()

/** Watch updates preserve ID, enabled state, and existing recommendations while replacing same-kind query fields. */
export const WatchUpdateParamsSchema = z.object({
  id: z.string(),
  watch: WatchFieldsSchema,
}).strict()

export const AuthorSearchParamsSchema = z.object({
  query: z.string().trim().min(2).max(200),
}).strict()

/** Suggest from either a sentence supplied now or the existing deterministic project profile. */
export const WatchSuggestionParamsSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('focus'),
    focus: z.string().trim().min(3).max(500),
  }).strict(),
  z.object({
    source: z.literal('project'),
    projectId: z.string().trim().min(1),
  }).strict(),
])

export const WatchSetActiveParamsSchema = z.object({
  id: z.string(),
  active: z.boolean(),
}).strict()

export const WatchDeleteParamsSchema = z.object({ id: z.string() }).strict()

/**
 * Trash record. `id` identifies the trash entry rather than the deleted entity;
 * `kind` preserves the former type and `title` its display name. `deletedAt` is
 * UTC midnight for the vault date and starts retention. `restorable` is false
 * when the original destination is missing, such as an attachment whose project
 * remains deleted, or taken, such as a paper whose page's place another page
 * holds, or a paper chat whose paper has started another chat.
 */
export const TrashEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(['inbox', 'later', 'paper', 'attachment', 'project', 'idea', 'chat']),
  title: z.string(),
  deletedAt: z.number().int(),
  restorable: z.boolean(),
}).strict()

export const TrashRestoreParamsSchema = z.object({ id: z.string() }).strict()

export const TrashPurgeParamsSchema = z.object({ id: z.string() }).strict()

/** A piece of a change line as it is shown: text, or a paper title, which shows as paper text. */
export const DiffPieceSchema = z.union([z.string(), z.object({ paper: z.string() }).strict()])

/**
 * The entity a recent-change title names, while it is in the vault: paper `id` (for a change to its
 * reading notes, highlights or remark too), project `id` or Wiki page `id`, named by
 * `title.slice(from, to)`.
 */
export const ChangeNamedSchema = z.object({
  kind: z.enum(['paper', 'project', 'page']),
  id: z.string(),
  from: z.number().int(),
  to: z.number().int(),
}).strict()

/**
 * Recent-change entry. `meta` is human-readable secondary text while `date`
 * drives day grouping. `source` distinguishes user and agent changes. Diff lines
 * begin with `+` or `-` and are the stored ones; `lines` are the same lines as
 * shown, in pieces, Wiki page ids named by their titles and paper titles marked.
 * `named` is the entity the title names, which the entry opens.
 * `undone` records completed undo, while `undoable`
 * reflects current snapshot availability. Snapshots and fingerprints remain in
 * Core. `archived` means acknowledged and removes the entry from active counts,
 * independently of undo state.
 */
export const ChangeEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  meta: z.string(),
  date: IsoDate,
  source: z.enum(['笔记', '实验', 'Meridian', '我']),
  diff: z.array(z.string()),
  lines: z.array(z.array(DiffPieceSchema)),
  named: ChangeNamedSchema.optional(),
  undone: z.boolean(),
  undoable: z.boolean(),
  archived: z.boolean(),
}).strict()

/**
 * What a write the change log records answers: `change` is the id of the change entry it recorded,
 * the one `changelog.undo` takes to undo exactly that write. A call response; nothing stores it.
 */
export const RecordedChangeSchema = z.object({ change: z.string() }).strict()

/**
 * What a write that moves one item into the trash without a change entry answers: `trash` is the id
 * of the trash entry it created, the one `trash.restore` takes. A call response; nothing stores it.
 */
export const TrashedEntrySchema = z.object({ trash: z.string() }).strict()

/**
 * What `project.update`, `project.deleteTask`, `project.deleteMilestone`, `project.deleteRelation`,
 * `project.removePaper` and `project.deleteAttachment` answer: the project after the write, and the
 * change entry it recorded.
 */
export const ProjectRecordedChangeSchema = RecordedChangeSchema.extend({ project: ProjectDetailSchema }).strict()

/**
 * What a write the change log records only in some cases answers: `change` is the id of the change
 * entry it recorded, or null when it recorded none. `papers.setColumns` records a change to the custom
 * columns, not one to which columns are hidden, grouped or ordered. A call response; nothing stores it.
 */
export const OptionalRecordedChangeSchema = z.object({ change: z.string().nullable() }).strict()

/**
 * What `papers.mutateReading` answers: the reading after the write, and the change entry it recorded.
 * Adding a note or a highlight and saving the reading position record none.
 */
export const ReadingRecordedChangeSchema = OptionalRecordedChangeSchema.extend({ reading: PaperReadingSchema }).strict()

export const ChangelogUndoParamsSchema = z.object({ id: z.string() }).strict()

export const ChangelogArchiveParamsSchema = z.object({ id: z.string() }).strict()

export const ChangelogDeleteParamsSchema = z.object({ id: z.string() }).strict()

/**
 * The entity a feed run or a chat mention names, by id: a `paper`, a `project` or a Wiki `page`.
 * `kind` takes any string, so a run naming a kind a later version adds still reads, as its text.
 */
export const FeedTargetSchema = z.object({ kind: z.string(), id: z.string() }).strict()

/**
 * Feed-body run whose `kind` controls presentation: plain text, emphasized text,
 * or a citation to a vault conclusion or page. `target` is the entity its text names.
 */
export const FeedRunSchema = z.object({
  kind: z.enum(['text', 'strong', 'cite']),
  text: z.string(),
  target: FeedTargetSchema.optional(),
}).strict()

/**
 * Briefing item requiring attention. `tag`, `text`, and `action` supply display
 * copy while the UI owns the action destination.
 */
export const FeedBriefItemSchema = z.object({
  id: z.string(),
  tag: z.string(),
  text: z.string(),
  action: z.string(),
}).strict()

/**
 * Feed entry body: either formatted runs or a brief summary with attention items.
 */
export const FeedBodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('runs'), runs: z.array(FeedRunSchema) }).strict(),
  z.object({
    kind: z.literal('brief'),
    heading: z.string(),
    items: z.array(FeedBriefItemSchema),
  }).strict(),
])

/**
 * Feed entry. `source` is both provenance and filter key; `day` selects the
 * localized date section and `time` is the legacy display timestamp.
 * `createdAt` lets the renderer show the local date and time it happened.
 * It stays optional so vaults written before exact activity timestamps remain
 * readable and can be migrated by Core.
 */
export const FeedEntrySchema = z.object({
  id: z.string(),
  source: z.enum(['steward', 'me', 'lab', 'inbox']),
  day: z.string(),
  time: z.string(),
  createdAt: IsoTimestamp.optional(),
  body: FeedBodySchema,
}).strict()

/** Version of the Wiki write protocol; Core accepts non-human proposals of exactly this version. */
export const WIKI_PROTOCOL_VERSION = 1

// Other processes and versions write proposal envelopes, queue records and claims, so their schemas are
// loose: an unknown additive field is kept, never a reason to refuse (AGENTS.md, Version Compatibility).

/** `<dir>/<file stem>`; neither part is `.` or `..`. */
export const PageIdSchema = z.string().regex(/^(?!\.{1,2}\/)[\p{L}\p{N}._-]+\/(?!\.{1,2}$)[\p{L}\p{N}._-]+$/u)
/** A claim id is ASCII so that it is also a valid Obsidian block id (`^id`). */
export const ClaimIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
/** `<page id>#<claim id>` */
export const ClaimRefSchema = z.string()
  .regex(/^(?!\.{1,2}\/)[\p{L}\p{N}._-]+\/(?!\.{1,2}#)[\p{L}\p{N}._-]+#[a-z0-9][a-z0-9-]{0,63}$/u)
const Fingerprint = z.string().regex(/^[0-9a-f]{16}$/)
/** The fingerprints of a page's stored frontmatter and stored body (write protocol §3.2). */
export const PageVersionSchema = z.object({ fm: Fingerprint, body: Fingerprint }).loose()

const ProposalTitle = z.string().trim().min(1).max(200)
const Quote = z.string().trim().min(1).max(2_000)
/** Trimmed, non-empty and bounded; "no line break" is checked in apply.ts. */
const OneLine = (max: number) => z.string().trim().min(1).max(max)
const ClaimText = OneLine(1_000)

/** A passage in a paper: the paper page, the 1-based PDF page, the verbatim quote, and the reader highlight it came from. */
export const SourceEvidenceSchema = z.object({
  kind: z.literal('source'), paper: PageIdSchema, page: z.number().int().positive(), quote: Quote,
  highlight: z.string().optional(),
}).loose()

/** A Lab result: a project node or a project conclusion (at least one, checked in apply.ts). */
export const ExperimentEvidenceSchema = z.object({
  kind: z.literal('experiment'), project: z.string().min(1),
  node: z.string().optional(), conclusion: z.string().optional(),
  text: z.string().trim().max(2_000).optional(),
}).loose()

/**
 * What supports a claim: a source passage, another claim or page, a Lab result, a pointer to the
 * user's own highlight or note (exactly one, checked in apply.ts), or the user's own judgment.
 */
export const EvidenceSchema = z.discriminatedUnion('kind', [
  SourceEvidenceSchema,
  z.object({ kind: z.literal('wiki'), ref: z.union([ClaimRefSchema, PageIdSchema]) }).loose(),
  ExperimentEvidenceSchema,
  z.object({
    kind: z.literal('note'), paper: PageIdSchema, highlight: z.string().optional(), note: z.string().optional(),
  }).loose(),
  z.object({ kind: z.literal('personal'), text: z.string().trim().max(2_000) }).loose(),
])

/** What a claim conflicts with: another claim, a source passage, or a Lab result. */
export const ConflictTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('claim'), ref: ClaimRefSchema }).loose(),
  SourceEvidenceSchema,
  ExperimentEvidenceSchema,
])

/** One evidence item on a claim as the contract shows it: the item, when and by whom it was added, and its display name. */
export const WikiEvidenceSchema = z.object({
  evidence: EvidenceSchema,
  added: IsoDate,
  by: z.string(),
  /** Paper short title, target claim text or page title, or project name; absent for personal evidence. */
  title: z.string().optional(),
  /** Name of the project node (its label) or legacy conclusion (its text) an experiment item cites; its id when gone. */
  point: z.string().optional(),
}).strict()

/**
 * One open conflict on a claim; `title` is the other side's display text (claim text, paper short title, or
 * project name), and `point` names the node or conclusion an experiment side cites, as on WikiEvidence.
 */
export const WikiConflictSchema = z.object({
  id: z.string(),
  against: ConflictTargetSchema,
  note: z.string(),
  since: IsoDate,
  by: z.string(),
  title: z.string(),
  point: z.string().optional(),
}).strict()

/**
 * A claim on an aggregation page: one settled finding with its version, when and by whom the current
 * version was written (HUMAN_PRODUCER or `ai:<producer id>`), its evidence, its open conflicts and earlier versions,
 * oldest first.
 */
export const WikiClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  version: z.number().int().positive(),
  since: IsoDate,
  by: z.string(),
  evidence: z.array(WikiEvidenceSchema),
  conflicts: z.array(WikiConflictSchema),
  history: z.array(z.object({
    version: z.number().int().positive(), text: z.string(), since: IsoDate, by: z.string(),
  }).strict()),
}).strict()

/** Deterministic Wiki signal kinds Core computes for producers (write protocol §6.2). */
export const WikiSignalKindSchema = z.enum([
  'unfiled-paper', 'thin-aggregation', 'single-child', 'duplicate-name', 'broken-link',
  'broken-membership', 'broken-claim-ref', 'cell-missing-anchor', 'claim-without-evidence',
  'open-conflict', 'missing-generated-region',
])

/**
 * One signal: the page (or `projects/<id>`) it is about, the page ids or claim refs involved, and one
 * plain sentence. A broken link also names the `missing` page it points to: by the title its trash
 * record holds when it is in the trash, else by the label its link writes or the last segment of its id.
 */
export const WikiSignalSchema = z.object({
  kind: WikiSignalKindSchema,
  page: z.string(),
  related: z.array(z.string()),
  detail: z.string(),
  missing: z.object({ name: z.string(), trashed: z.boolean() }).strict().optional(),
}).strict()

/**
 * Aggregation kind from `schema.yaml`: frontmatter key, display label, page
 * directory, and current vault page count.
 */
export const WikiKindSchema = z.object({
  key: z.string(),
  label: z.string(),
  dir: z.string(),
  count: z.number().int(),
}).strict()

/** Reference to a page with its ID and display name: title for aggregations and short title for papers. */
/** A link to a wiki page: its short display name, plus the full title when the name is a shortened paper title. */
export const WikiRefSchema = z.object({ id: z.string(), title: z.string(), fullTitle: z.string().optional() }).strict()

/**
 * Aggregation card with kind, title, first non-heading body line as summary, ISO
 * update date, and counts for children, direct members, and parents.
 */
export const WikiAggregationCardSchema = z.object({
  id: z.string(),
  kind: z.string(),
  kindLabel: z.string(),
  title: z.string(),
  summary: z.string(),
  updated: IsoDate,
  childCount: z.number().int(),
  memberCount: z.number().int(),
  parentCount: z.number().int(),
}).strict()

/** Comparison-table cell containing a value and its source anchor by page and quote. */
export const WikiCellSchema = z.object({
  value: z.string(),
  page: z.number().int(),
  quote: z.string(),
}).strict()

export const WikiColumnSchema = z.object({ key: z.string(), label: z.string() }).strict()

/** Comparison-table row with member paper, populated cells, and linked pages for derived columns. */
export const WikiRowSchema = z.object({
  paper: WikiRefSchema,
  cells: z.record(z.string(), WikiCellSchema),
  derived: z.record(z.string(), z.array(WikiRefSchema)),
}).strict()

/** Related-panel row naming another aggregation kind and pages shared by member papers. */
export const WikiRelatedSchema = z.object({
  label: z.string(),
  links: z.array(WikiRefSchema),
}).strict()

/**
 * Aggregation page with card fields, parents, optional split basis, child cards,
 * comparison table, relations, claims in page order, and body Markdown after the final generated
 * region. `titles` maps valid body-link IDs to a link to that page; `version` is the page version.
 */
export const WikiAggregationSchema = WikiAggregationCardSchema.extend({
  parents: z.array(WikiRefSchema),
  splitOn: z.string().optional(),
  children: z.array(WikiAggregationCardSchema),
  columns: z.array(WikiColumnSchema),
  derivedColumns: z.array(WikiColumnSchema),
  rows: z.array(WikiRowSchema),
  related: z.array(WikiRelatedSchema),
  claims: z.array(WikiClaimSchema),
  body: z.string(),
  titles: z.record(z.string(), WikiRefSchema),
  version: PageVersionSchema,
}).strict()

/** Paper membership in an aggregation with kind and populated table cells keyed by display label. */
export const WikiMembershipSchema = z.object({
  aggregation: WikiRefSchema,
  kind: z.string(),
  kindLabel: z.string(),
  cells: z.array(z.object({ label: z.string(), cell: WikiCellSchema }).strict()),
}).strict()

/**
 * Paper wiki page. `id` combines the paper prefix and table-row ID; `short` is
 * the short title for editing and search, the full title when none is set; `pdf` is a vault-relative source path; `body`
 * is raw Markdown; `memberships` lists aggregations. Pages are created on import
 * and may have empty bodies. `titles` resolves valid body-link IDs to links; `version` is the page version.
 */
export const WikiPaperSchema = z.object({
  id: z.string(),
  title: z.string(),
  short: z.string(),
  authors: z.array(z.string()),
  year: z.number().int().optional(),
  venue: z.string(),
  pdf: z.string(),
  updated: IsoDate,
  body: z.string(),
  titles: z.record(z.string(), WikiRefSchema),
  memberships: z.array(WikiMembershipSchema),
  version: PageVersionSchema,
}).strict()

/**
 * Wiki home: total aggregation count for the sidebar badge, kinds in schema
 * order, and root aggregations ordered by schema kind then ID.
 */
export const WikiHomeSchema = z.object({
  aggregationCount: z.number().int(),
  kinds: z.array(WikiKindSchema),
  roots: z.array(WikiAggregationCardSchema),
}).strict()

export const WikiAggregationParamsSchema = z.object({ id: z.string() }).strict()

export const WikiPaperParamsSchema = z.object({ id: z.string() }).strict()

/**
 * One thing that refers to a Wiki page: another page whose body links to it, a project whose
 * relations name it or that links the paper, an idea the paper is the source of, or a chat that reads
 * the paper or mentions the page. `id` is that page's, project's, idea's or chat's id and `title` its
 * display name; a page also carries `fullTitle` when `title` is a shortened paper title, and an
 * aggregation page carries its kind's label.
 */
export const WikiBacklinkSchema = z.object({
  kind: z.enum(['page', 'project', 'idea', 'chat']),
  id: z.string(),
  title: z.string(),
  fullTitle: z.string().optional(),
  kindLabel: z.string().optional(),
}).strict()

export const WikiBacklinksParamsSchema = z.object({ id: z.string() }).strict()

/** Updates wiki body Markdown only; frontmatter and generated regions do not pass through this input. */
export const WikiUpdateParamsSchema = z.object({ id: z.string(), body: z.string() }).strict()

/**
 * One proposal operation. All variants are writes: create aggregation, set or
 * remove paper membership, append to a region, change columns, change parents,
 * or edit user-maintained aggregation metadata. Proposals are the Harness's only
 * wiki write path, so UI edits use the same auditable operations.
 */
export const ProposalOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('createAggregation'),
    kind: z.string(),
    id: z.string(),
    title: z.string(),
    parents: z.array(z.string()),
    columns: z.array(WikiColumnSchema),
    describe: z.string(),
    splitOn: z.string().optional(),
  }).strict(),
  z.object({
    op: z.literal('setMembership'),
    paper: z.string(),
    in: z.string(),
    cells: z.record(z.string(), WikiCellSchema),
  }).strict(),
  z.object({
    op: z.literal('removeMembership'),
    paper: z.string(),
    in: z.string(),
  }).strict(),
  z.object({
    op: z.literal('appendEntry'),
    page: z.string(),
    section: z.string(),
    date: IsoDate,
    text: z.string(),
  }).strict(),
  z.object({
    op: z.literal('setColumns'),
    page: z.string(),
    columns: z.array(WikiColumnSchema),
  }).strict(),
  z.object({
    op: z.literal('setParents'),
    page: z.string(),
    parents: z.array(z.string()),
  }).strict(),
  z.object({
    op: z.literal('setAggregationMetadata'),
    page: z.string(),
    title: z.string().trim().min(1).max(2_000),
    splitOn: z.string().trim().max(500).nullable(),
  }).strict(),
  z.object({
    op: z.literal('addClaim'), page: PageIdSchema,
    claim: z.object({
      id: ClaimIdSchema, text: ClaimText, evidence: z.array(EvidenceSchema).min(1).max(50),
    }).loose(),
  }).loose(),
  z.object({
    op: z.literal('reviseClaim'), page: PageIdSchema, claim: ClaimIdSchema, text: ClaimText,
    evidence: z.array(EvidenceSchema).max(50).optional(),
  }).loose(),
  z.object({
    op: z.literal('addEvidence'), page: PageIdSchema, claim: ClaimIdSchema,
    evidence: z.array(EvidenceSchema).min(1).max(50),
  }).loose(),
  z.object({
    op: z.literal('markConflict'), page: PageIdSchema, claim: ClaimIdSchema,
    conflict: z.object({ id: ClaimIdSchema, against: ConflictTargetSchema, note: OneLine(1_000) }).loose(),
  }).loose(),
  z.object({
    op: z.literal('resolveConflict'), page: PageIdSchema, claim: ClaimIdSchema, conflict: ClaimIdSchema,
    outcome: z.enum(['revised', 'split', 'retracted', 'dismissed']), note: OneLine(1_000),
  }).loose(),
  z.object({
    op: z.literal('retractClaim'), page: PageIdSchema, claim: ClaimIdSchema, reason: OneLine(1_000),
  }).loose(),
])

/** The six ops that act on claims; the only ops a non-human producer may submit. */
export const CLAIM_OPS = [
  'addClaim', 'reviseClaim', 'addEvidence', 'markConflict', 'resolveConflict', 'retractClaim',
] as const

/**
 * Write-back proposal. `source` identifies its producer, `title` summarizes it
 * for recent changes, and `ops` execute in order. Any invalid operation prevents
 * the entire proposal from reaching disk.
 */
export const ProposalSchema = z.object({
  source: z.enum(['ingest', 'lint', 'chat', 'user']),
  title: z.string(),
  ops: z.array(ProposalOpSchema).min(1),
}).strict()

export const WikiApplyParamsSchema = z.object({ proposal: ProposalSchema }).strict()

/** Who wrote a non-human proposal. `human` is refused by `wiki.propose`; an AI producer id looks like `skill.meridian`. */
export const ProducerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('human') }).loose(),
  z.object({
    kind: z.literal('ai'),
    id: z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/),
    model: z.string().max(200).optional(),
  }).loose(),
])

/** What prompted a proposal. */
export const TriggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }).loose(),
  z.object({ kind: z.literal('ingest'), paper: PageIdSchema }).loose(),
  z.object({ kind: z.literal('lint'), signals: z.array(WikiSignalKindSchema).min(1) }).loose(),
  z.object({ kind: z.literal('chat'), session: z.string().min(1) }).loose(),
  z.object({ kind: z.literal('reading'), paper: PageIdSchema }).loose(),
  z.object({ kind: z.literal('experiment'), project: z.string().min(1), node: z.string().optional() }).loose(),
])

/**
 * A non-human proposal envelope (write protocol §2.1). `key` is unique per producer; `base` gives the
 * version of every page the ops name (null: the page must not exist); `ops` run in order.
 */
export const AgentProposalSchema = z.object({
  protocol: z.literal(WIKI_PROTOCOL_VERSION),
  key: z.string().min(1).max(200),
  producer: ProducerSchema,
  trigger: TriggerSchema,
  title: ProposalTitle,
  rationale: z.string().max(4_000).optional(),
  base: z.record(PageIdSchema, PageVersionSchema.nullable()),
  ops: z.array(ProposalOpSchema).min(1).max(500),
}).loose()

const ProposalReasonSchema = z.object({
  kind: z.enum(['stale', 'invalid', 'declined']),
  message: z.string(),
}).loose().nullable()

/**
 * One entry of the review queue `.meridian/proposals.json`, newest first. `digest` fingerprints the
 * proposal (or, for an inbox file that did not parse, the file text, and then `proposal` is null).
 * `received` and `decided.at` are epoch ms. `notice` flags a queued proposal whose source quotes could
 * not be verified. `change` is the change record id once applied.
 */
export const ProposalRecordSchema = z.object({
  id: z.string(),
  digest: Fingerprint,
  proposal: AgentProposalSchema.nullable(),
  received: z.number().int(),
  path: z.enum(['auto', 'review']),
  status: z.enum(['queued', 'applied', 'rejected']),
  reason: ProposalReasonSchema,
  decided: z.object({ at: z.number().int(), by: z.enum(['我', 'policy']) }).loose().nullable(),
  change: z.string().nullable(),
  notice: z.string().nullable(),
}).loose()

/**
 * A queue record as the review list reads it, plus derived fields: the pages it would write, whether the
 * pages it rests on changed since it was made, the titles of what it names (a page by its id, a project
 * as `projects/<id>`, a node as `projects/<id>#<node>`, a column of the page a membership joins as
 * `<page>#<column key>`, a Wiki kind by its key), and the current text of each claim it names by
 * `<page>#<claim>`. Anything no longer in the vault has no entry.
 */
export const WikiProposalSchema = ProposalRecordSchema.extend({
  pages: z.array(z.string()),
  staleNow: z.boolean(),
  /** The first page it rests on whose version changed since it was made, when `staleNow`. */
  stalePage: z.string().optional(),
  /** `projects/<id>#<node or conclusion>` of each cited project conclusion the user has not verified yet. */
  unverified: z.array(z.string()).optional(),
  titles: z.record(z.string(), z.string()),
  claimTexts: z.record(z.string(), z.string()),
}).loose()

/** What submitting or deciding a proposal came to. */
export const ProposalReceiptSchema = z.object({
  id: z.string(),
  status: z.enum(['applied', 'queued', 'rejected']),
  reason: ProposalReasonSchema,
}).loose()

/** Params of `wiki.propose`; Core parses the envelope itself so that every refusal names its cause. */
export const WikiProposeParamsSchema = z.object({ proposal: z.unknown() }).strict()

export const WikiProposalsParamsSchema = z.object({
  status: z.enum(['queued', 'applied', 'rejected']).optional(),
}).strict()

export const WikiDecideParamsSchema = z.object({
  id: z.string(),
  decision: z.enum(['apply', 'decline']),
  reason: z.string().trim().max(1_000).optional(),
}).strict()

/**
 * Chat message run whose `kind` distinguishes plain text from an entered `@` mention. A mention's
 * `target` is the entity it names; the messages Core hands over leave it out once that entity is no
 * longer in the vault.
 */
export const ChatRunSchema = z.object({
  kind: z.enum(['text', 'mention']),
  text: z.string(),
  target: FeedTargetSchema.optional(),
}).strict()

/**
 * Action below a chat message. `label` is button copy; the current `writeBack`
 * action appends `text` to the target project's research log.
 */
export const ChatActionSchema = z.object({
  kind: z.literal('writeBack'), label: z.string(), project: z.string(), text: z.string(),
  done: z.boolean().optional(),
}).strict()

/**
 * Which model wrote an AI answer: one run on the user's subscription CLI `cli`, `id` naming the model
 * the CLI reported or was set to and absent when the CLI ran its own default and named none; or one
 * reached through an API, `id` naming the configured model.
 */
export const ChatAnswerModelSchema = z.discriminatedUnion('route', [
  z.object({ route: z.literal('subscription'), cli: HarnessCliSchema, id: z.string().min(1).max(200).optional() }).strict(),
  z.object({ route: z.literal('api'), id: z.string().min(1).max(200) }).strict(),
])

/**
 * Chat message. `role` distinguishes user, AI answer, and Meridian status copy;
 * status messages are not rendered as answer bubbles. Messages without buttons
 * carry an empty actions array. `model`, on an AI answer, is the model that wrote
 * it; answers kept before 0.0.21.0 name none.
 */
export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['you', 'ai', 'status']),
  runs: z.array(ChatRunSchema),
  actions: z.array(ChatActionSchema),
  model: ChatAnswerModelSchema.optional(),
}).strict()

/**
 * Chat session. Archived sessions appear in the archived sidebar group;
 * `messageCount` lets creation reuse an empty ordinary chat. With `paperId`, the
 * session is the paper's unique reading context shared by Reader and chat views.
 * Title-finalization state remains internal to Core.
 */
export const ChatSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  archived: z.boolean(),
  messageCount: z.number().int(),
  paperId: z.string().optional(),
}).strict()

/** The projects and Wiki pages an idea relates to, each once. */
export const IdeaRelationsSchema = z.object({
  projects: z.array(z.string()),
  pages: z.array(z.string()),
}).strict()

/**
 * A user-authored research idea distilled from a conversation. It is personal research state, not
 * source evidence or canonical Wiki content. The source link preserves where the reasoning came
 * from without copying an arbitrary chat sentence into the idea.
 */
export const ResearchIdeaSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(20_000),
  /**
   * Where the idea came from. An idea saved from a chat names that chat by `chatId`; one a coding
   * agent recorded in a project workspace has `agent: true`, no `chatId`, and `chatTitle` describing
   * the work it came up in.
   */
  source: z.object({
    chatId: z.string().optional(),
    chatTitle: z.string(),
    paperId: z.string().optional(),
    paperTitle: z.string().optional(),
    agent: z.literal(true).optional(),
  }).strict(),
  /**
   * The project whose bound workspace a coding agent recorded the idea in: where it was sparked, never
   * what it relates to or where it is carried out.
   */
  sourceProject: z.string().optional(),
  /** What the idea is about, as only the user chose or confirmed: projects, and Wiki aggregation pages. */
  relations: IdeaRelationsSchema.optional(),
  /**
   * The project the idea is carried out in; name and status are always read from the project to avoid
   * duplicated state. Without it the idea is not started.
   */
  project: z.string().optional(),
  /** Optional node inside the linked project's current research graph. */
  node: z.string().optional(),
  /** A node of `sourceProject`'s research graph an agent attached on arrival; it counts once the user confirms it. */
  candidateNode: z.string().optional(),
  /** Archiving removes the idea from the active attention queue without deleting it or its provenance. */
  archived: z.boolean().default(false),
  created: IsoDate,
  updated: IsoDate,
}).strict()

const ChatMessageFieldsSchema = ChatMessageSchema.omit({ id: true })

/**
 * Chat creation accepts a title and whether it is final; Core supplies all other
 * fields. An unnamed placeholder is replaced from the first user message.
 */
export const ChatCreateParamsSchema = z.object({
  title: z.string(),
  named: z.boolean(),
}).strict()

/** Gets a paper's unique reading chat; Core derives title and identity from the paper page. */
export const ChatForPaperParamsSchema = z.object({ paperId: z.string() }).strict()

export const ChatMessagesParamsSchema = z.object({ id: z.string() }).strict()

export const ChatAppendParamsSchema = z.object({
  id: z.string(),
  messages: z.array(ChatMessageFieldsSchema),
}).strict()

/**
 * One explicit send is one billable model turn; Core owns persistence, context, and cancellation.
 * `runs` is what the user wrote, each mention as a run of its own, `@` and the name on one line,
 * naming the project, paper or Wiki page it mentions; the whole text holds at most 20,000
 * characters and more than whitespace.
 */
export const ChatSendParamsSchema = z.object({
  id: z.string(),
  runs: z.array(ChatRunSchema.refine((run) => (run.kind === 'text'
    ? run.target === undefined
    : /^@[^\n]+$/.test(run.text) && ['project', 'paper', 'page'].includes(run.target?.kind ?? '')))).min(1),
}).strict().refine(({ runs }) => {
  const text = runs.map((run) => run.text).join('')
  return text.trim() !== '' && text.length <= 20_000
})

export const ChatSendResultSchema = z.object({
  id: z.string(),
  state: z.enum(['complete', 'failed', 'cancelled']),
  /** Why a `failed` send failed. */
  reason: CallFailureSchema.optional(),
}).strict()

export const ChatCancelParamsSchema = z.object({ id: z.string() }).strict()

/** Reads the answer being written in a chat; answers a ChatWriting, or null while no turn runs there. */
export const ChatWritingParamsSchema = z.object({ id: z.string() }).strict()

/**
 * What chat `id` runs on: `source`, the configured source it chose, or the default once it chose none
 * or its source was removed, null while there is none; `model` and `effort` are the chat's own model
 * of that source and its own reasoning effort, each absent while the chat runs the source's. A run on
 * the chat's own model without its own effort runs at that model's own default effort.
 */
export const ChatModelChoiceSchema = z.object({
  source: z.string().min(1).max(320).nullable(),
  model: z.string().max(200).optional(),
  effort: HarnessEffortSchema.optional(),
}).strict()
export const ChatModelParamsSchema = z.object({ id: z.string() }).strict()
/**
 * Makes chat `id` run on configured source `source`, on its model `model` and at reasoning effort
 * `effort`, each else the source's own.
 */
export const ChatSetModelParamsSchema = z.object({
  id: z.string(),
  source: z.string().min(1).max(320),
  model: HarnessSubscriptionModelSchema.optional(),
  effort: HarnessEffortSchema.optional(),
}).strict()

/**
 * The answer a chat's turn is writing: the model writing it, as far as Core knows it yet, its `text`
 * so far, empty until the first text arrives, which a model that does not stream sends only with the
 * whole answer, and `since`, when the turn began.
 */
export const ChatWritingSchema = z.object({ text: z.string(), model: ChatAnswerModelSchema, since: IsoTimestamp }).strict()

/**
 * Where an AI call failed: `start`, while the AI service started; `request`, in the AI service's
 * request; `cli`, in the subscription CLI's run; `core`, in the App itself. `kind` is the failure's
 * own kind as that step names it, and `detail` what it says, with keys and tokens redacted.
 */
export const HarnessFailureDetailSchema = z.object({
  step: z.enum(['start', 'request', 'cli', 'core']),
  kind: z.string().min(1).max(64),
  detail: z.string().min(1).max(500),
}).strict()

/** Reads where a chat's last turn failed; answers a HarnessFailureDetail, or null when Core knows of none. */
export const ChatFailureParamsSchema = z.object({ id: z.string() }).strict()

/** Asks again for an answer to a chat's last question, after its turn got none; answers a ChatSendResult. */
export const ChatRetryParamsSchema = z.object({ id: z.string() }).strict()
export const ChatCancelResultSchema = z.object({ id: z.string(), cancelled: z.boolean() }).strict()

/**
 * Creates an idea from the chat `chatId` names, or, without it, one the user writes down on their own;
 * `sourceProject` names the project whose page it was written down on.
 */
export const ResearchIdeaCreateParamsSchema = z.object({
  chatId: z.string().optional(),
  sourceProject: z.string().optional(),
  title: ResearchIdeaSchema.shape.title,
  body: ResearchIdeaSchema.shape.body,
}).strict()

export const ResearchIdeaUpdateParamsSchema = z.object({
  id: z.string(),
  patch: z.object({
    title: ResearchIdeaSchema.shape.title.optional(),
    body: ResearchIdeaSchema.shape.body.optional(),
    project: z.string().nullable().optional(),
    relations: IdeaRelationsSchema.optional(),
    archived: z.boolean().optional(),
  }).strict().refine((patch) => Object.keys(patch).length > 0, '没有要更新的想法字段'),
}).strict()

export const ResearchIdeaPromoteParamsSchema = z.object({ id: z.string() }).strict()
export const ResearchIdeaDeleteParamsSchema = z.object({ id: z.string() }).strict()
/** Sets the manual display order for the idea list, the same way project.reorder does for projects. */
export const ResearchIdeaReorderParamsSchema = z.object({
  order: z.array(z.string()),
}).strict()
export const ResearchIdeaPromoteResultSchema = z.object({
  idea: ResearchIdeaSchema,
  project: ProjectDetailSchema,
}).strict()

/**
 * Explicit placement of a project-linked idea in the project's current research graph. `confirm` and
 * `dismiss` act on the idea's candidate node: confirming carries the idea out in its source project at
 * that node, dismissing drops the candidate.
 */
export const ResearchIdeaGraphPlacementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('create'),
    label: z.string().trim().min(1).max(160),
    after: z.string().nullable(),
  }).strict(),
  z.object({ kind: z.literal('link'), nodeId: z.string() }).strict(),
  z.object({ kind: z.literal('unlink') }).strict(),
  z.object({ kind: z.literal('confirm') }).strict(),
  z.object({ kind: z.literal('dismiss') }).strict(),
])

export const ResearchIdeaPlaceOnGraphParamsSchema = z.object({
  id: z.string(),
  placement: ResearchIdeaGraphPlacementSchema,
}).strict()

/** The idea after a placement, with the project whose graph it touched, or null when it touched none. */
export const ResearchIdeaPlaceOnGraphResultSchema = z.object({
  idea: ResearchIdeaSchema,
  project: ProjectDetailSchema.nullable(),
  nodeId: z.string().nullable(),
}).strict()

/** Executes a message action that writes to a project research log. */
export const ChatRecordActionParamsSchema = z.object({
  id: z.string(),
  messageId: z.string(),
}).strict()

export const ChatSetArchivedParamsSchema = z.object({
  id: z.string(),
  archived: z.boolean(),
}).strict()

/** Gives a chat the title the user typed; a message sent to it afterwards no longer names it. A paper's reading chat is refused. */
export const ChatRenameParamsSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(160),
}).strict()

/** Moves a chat into the trash; a reply it is generating stops first. */
export const ChatDeleteParamsSchema = z.object({ id: z.string() }).strict()

/** Where in its target a search hit lands: a page with a highlight or note on it, or a project's task. */
export const SearchAnchorSchema = z.object({
  page: z.number().int().positive().optional(),
  highlight: z.string().optional(),
  note: z.string().optional(),
  task: z.string().optional(),
}).strict()

/**
 * Global-search hit, a call response that is never stored. `kind` selects the
 * destination surface and `target` the entity ID there: the Wiki page of an
 * aggregation, the project of a task, the read-later entry of a paper not in
 * the vault, otherwise the entity itself. `anchor` says where in the target to
 * land. `title` is display text, the type prefix and the entity's title, and
 * `meta` secondary text. `snippet` is the text around a match outside the
 * title, absent for a title match. `pdf`, on paper hits only, says whether the
 * vault holds the paper's source PDF.
 */
export const SearchHitSchema = z.object({
  kind: z.enum(['aggregation', 'project', 'chat', 'paper', 'idea', 'task', 'later']),
  target: z.string(),
  title: z.string(),
  meta: z.string(),
  snippet: z.string().optional(),
  anchor: SearchAnchorSchema.optional(),
  pdf: z.boolean().optional(),
}).strict()

export const SearchParamsSchema = z.object({ query: z.string() }).strict()

/** Feed creation accepts source and body; Core supplies ID, date section, and time from the vault date. */
export const FeedAppendParamsSchema = FeedEntrySchema.omit({ id: true, day: true, time: true })

/** Creates a conclusion with optional originating chat and referenced paper. */
export const ProjectCreateConclusionParamsSchema = z.object({
  projectId: z.string(),
  text: z.string().trim().min(1).max(2_000),
  chat: z.string().optional(),
  paper: z.string().optional(),
}).strict()

export const ProjectSetConclusionStateParamsSchema = z.object({
  projectId: z.string(),
  conclusionId: z.string(),
  state: ConclusionStateSchema,
}).strict()

export const ProjectDeleteConclusionParamsSchema = z.object({
  projectId: z.string(),
  conclusionId: z.string(),
}).strict()

/** Marks the conclusion node `node` holds as verified; `fingerprint` is that of the conclusion the user saw. */
export const ProjectVerifyConclusionParamsSchema = z.object({
  projectId: z.string(),
  node: z.string(),
  fingerprint: z.string(),
}).strict()

/** Withdraws the user's verification of node `node`'s conclusion. */
export const ProjectUnverifyConclusionParamsSchema = z.object({
  projectId: z.string(),
  node: z.string(),
}).strict()

/** Metadata extraction and current stage for one upload. */
export const MetadataJobSchema = z.object({
  id: z.string(),
  batch: z.number().int().positive(),
  paperId: z.string(),
  title: z.string(),
  bytes: z.number().int(),
  step: z.enum(['read', 'detect', 'lookup', 'write', 'done', 'failed']),
  found: z.enum(['arxiv', 'pdf', 'none']).nullable(),
  error: z.string().nullable(),
}).strict()

/**
 * Current state of a watch-driven fetch; `reason` says why the last fetch failed. `last` is the last
 * finished run, absent before the first: the watches it fetched, null for every active one, how many
 * new papers it delivered, and when it finished.
 */
export const FetchStatusSchema = z.object({
  state: z.enum(['idle', 'checking', 'failed']),
  checkedAt: z.number().int().nullable(),
  reason: NetFailureSchema.nullable(),
  last: z.object({
    watches: z.array(z.string()).nullable(),
    added: z.number().int().min(0),
    at: z.number().int(),
  }).strict().optional(),
}).strict()

/** Source currently downloading with byte progress. */
export const DownloadProgressSchema = z.object({
  id: z.string(),
  received: z.number().int(),
  total: z.number().int().nullable(),
}).strict()

/**
 * Current state of Core work that outlives a single call; `generating` holds the ids of the chats whose
 * reply is being generated, `generatingWiki` the ids of the papers whose Wiki proposal is, and
 * `wikiFailures` why the last Wiki run of a paper failed, by paper id, until a new start or a dismiss.
 */
export const JobsStatusSchema = z.object({
  writes: z.number().int(),
  uploads: z.array(MetadataJobSchema),
  downloads: z.array(DownloadProgressSchema),
  fetch: FetchStatusSchema,
  generating: z.array(z.string()),
  generatingWiki: z.array(z.string()),
  wikiFailures: z.record(z.string(), CallFailureSchema),
}).strict()

/** Input for no-argument methods: renderer sends an empty object and the boundary rejects extra keys. */
export const EmptyParamsSchema = z.object({}).strict()

/**
 * Paper Wiki workspace opened by the desktop app. The renderer knows only the
 * root, never internal source, wiki, or personal-state paths. `source` records
 * selection provenance; environment and fixture modes are read-only.
 */
export const LibrarySourceSchema = z.enum(['environment', 'configured', 'fallback', 'fixture'])

export const LibraryLocationSchema = z.object({
  root: z.string(),
  source: LibrarySourceSchema,
  locked: z.boolean(),
  restartRequired: z.boolean(),
  /** Why the library at `root` failed to open, or null when it opened (or has not been tried yet). */
  openError: CallFailureSchema.nullable(),
}).strict()

export const LibraryConfigureParamsSchema = z.object({ root: z.string().min(1) }).strict()

export const LibraryBackupSchema = z.object({
  id: z.string().min(1).max(255),
  path: z.string().min(1),
  createdAt: IsoTimestamp,
}).strict()

export const LibraryBackupParamsSchema = z.object({ id: z.string().min(1).max(255) }).strict()

export const LibraryResetResultSchema = z.object({
  root: z.string(),
  backupRoot: z.string(),
}).strict()

/** Local coding-agent plugin package detected by Core without invoking its CLI. */
export const ExtensionClientSchema = z.enum(['codex', 'claude-code'])

/** Whether the user saved a Semantic Scholar API key, and its last four characters when so. */
export const SemanticKeyStatusSchema = z.object({
  configured: z.boolean(),
  lastFour: z.string().optional(),
}).strict()

/** Saves an optional Semantic Scholar API key; null or blank removes the saved key. */
export const SemanticKeySetParamsSchema = z.object({ apiKey: z.string().max(200).nullable() }).strict()

const ThemeColourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色必须是 #RRGGBB')
const ColourThemeIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/, '主题 id 只能用小写字母、数字和连字符')

/**
 * The thirteen module colours of one appearance mode: window ground, sidebar, cards, fields, the
 * three text steps, separators, the accent, the error, warning and done states, and the reading
 * highlight. Every other colour token is derived from them.
 */
export const ColourThemeModulesSchema = z.object({
  ground: ThemeColourSchema, sidebar: ThemeColourSchema, card: ThemeColourSchema, field: ThemeColourSchema,
  ink: ThemeColourSchema, inkSecondary: ThemeColourSchema, inkTertiary: ThemeColourSchema,
  separator: ThemeColourSchema, accent: ThemeColourSchema,
  error: ThemeColourSchema, warning: ThemeColourSchema, done: ThemeColourSchema, highlight: ThemeColourSchema,
})

/**
 * A colour theme, built in or the user's `<config home>/themes/<id>.json`, in light and dark. Not
 * strict: a file another version wrote keeps loading with its unknown keys dropped. `basedOn` names
 * the theme it started from.
 */
export const ColourThemeSchema = z.object({
  schema: z.literal('meridian.theme.v1'),
  id: ColourThemeIdSchema,
  name: z.string().trim().min(1).max(80),
  basedOn: ColourThemeIdSchema.optional(),
  light: ColourThemeModulesSchema,
  dark: ColourThemeModulesSchema,
})

/**
 * Why a file in `<config home>/themes` cannot be used: it cannot be read, is not JSON, carries
 * another theme schema version, does not match the theme format, names another id than its file,
 * or takes a built-in theme's id.
 */
export const ColourThemeProblemSchema = z.enum(['unreadable', 'syntax', 'version', 'format', 'id', 'built-in'])

/**
 * One `.json` file in `<config home>/themes`, by file name: its theme, or why it cannot be used and,
 * when one key is at fault, that key's dotted path, such as `light.accent`.
 */
export const ColourThemeFileSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('readable'), file: z.string().min(1), theme: ColourThemeSchema }).strict(),
  z.object({
    state: z.literal('unreadable'), file: z.string().min(1), reason: ColourThemeProblemSchema,
    path: z.string().min(1).optional(),
  }).strict(),
])

/** Writes one custom theme to `<config home>/themes/<id>.json`, replacing the file of that id. */
export const ColourThemeSaveParamsSchema = z.object({ theme: ColourThemeSchema }).strict()

/** Deletes the file of one custom theme. */
export const ColourThemeDeleteParamsSchema = z.object({ id: ColourThemeIdSchema }).strict()

/** The outcome of one Semantic Scholar request made with the saved key. */
export const SemanticKeyCheckResultSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('connected') }).strict(),
  z.object({
    state: z.literal('failed'),
    reason: z.enum(['authentication', 'rate-limit', 'timeout', 'unavailable', 'unknown']),
    detail: z.string().trim().min(1).max(500),
  }).strict(),
])

/**
 * The newest plugin version known, which the skills and MCP share, and when master was last read for
 * it; `checkedAt` is null until a read has succeeded, and the version is then the bundled one.
 */
export const PluginVersionSchema = z.object({
  version: z.string(),
  checkedAt: z.string().nullable(),
}).strict()

export const ExtensionStatusSchema = z.object({
  id: ExtensionClientSchema,
  name: z.string(),
  state: z.enum(['installed', 'update-required', 'not-installed']),
  version: z.string().optional(),
  installCommand: z.string().min(1),
  updateCommand: z.string().min(1),
}).strict()

export type PaperRow = z.infer<typeof PaperRowSchema>
export type MetadataJob = z.infer<typeof MetadataJobSchema>
export type PublicationFillResult = z.infer<typeof PublicationFillResultSchema>
export type FetchStatus = z.infer<typeof FetchStatusSchema>
export type DownloadProgress = z.infer<typeof DownloadProgressSchema>
export type JobsStatus = z.infer<typeof JobsStatusSchema>
export type PaperCell = z.infer<typeof PaperCellSchema>
export type PaperColumns = z.infer<typeof PaperColumnsSchema>
export type PaperColumn = PaperColumns['custom'][number]
export type ReadState = z.infer<typeof ReadStateSchema>
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>
export type Conclusion = z.infer<typeof ConclusionSchema>
export type ProjectConclusion = z.infer<typeof ProjectConclusionSchema>
export type ConclusionState = z.infer<typeof ConclusionStateSchema>
export type Conclusions = z.infer<typeof ConclusionsSchema>
export type PaperFields = z.infer<typeof PaperFieldsSchema>
export type PaperImportResult = z.infer<typeof PaperImportResultSchema>
export type PaperHighlightRect = z.infer<typeof PaperHighlightRectSchema>
export type PaperHighlight = z.infer<typeof PaperHighlightSchema>
export type PaperNote = z.infer<typeof PaperNoteSchema>
export type PaperReading = z.infer<typeof PaperReadingSchema>
export type ReadingMutation = z.infer<typeof ReadingMutationSchema>
export type HarnessPlan = z.infer<typeof HarnessPlanSchema>
export type HarnessStartParams = z.infer<typeof HarnessStartParamsSchema>
export type HarnessCancelResult = z.infer<typeof HarnessCancelResultSchema>
export type HarnessRunReceipt = z.infer<typeof HarnessRunReceiptSchema>
export type HarnessPaperWikiDraft = z.infer<typeof HarnessPaperWikiDraftSchema>
export type HarnessPaperWikiReview = z.infer<typeof HarnessPaperWikiReviewSchema>
export type HarnessPaperWikiReviewSection = z.infer<typeof HarnessPaperWikiReviewSectionSchema>
export type HarnessPaperWikiReviewGroup = z.infer<typeof HarnessPaperWikiReviewGroupSchema>
export type HarnessPaperWikiQuality = z.infer<typeof HarnessPaperWikiQualitySchema>
export type HarnessPaperWikiQualityFinding = z.infer<typeof HarnessPaperWikiQualityFindingSchema>
export type HarnessPendingPaperWikiResult = z.infer<typeof HarnessPendingPaperWikiResultSchema>
export type HarnessApplyPaperWikiParams = z.infer<typeof HarnessApplyPaperWikiParamsSchema>
export type HarnessApplyPaperWikiResult = z.infer<typeof HarnessApplyPaperWikiResultSchema>
export type HarnessPaperWikiRejectionReason = z.infer<typeof HarnessPaperWikiRejectionReasonSchema>
export type HarnessPaperWikiRejectionFeedback = z.infer<typeof HarnessPaperWikiRejectionFeedbackSchema>
export type HarnessRejectPaperWikiParams = z.infer<typeof HarnessRejectPaperWikiParamsSchema>
export type HarnessRejectPaperWikiResult = z.infer<typeof HarnessRejectPaperWikiResultSchema>
export type HarnessModelProfile = z.infer<typeof HarnessModelProfileSchema>
export type HarnessModelSettings = z.infer<typeof HarnessModelSettingsSchema>
export type HarnessModelSettingsUpdate = z.infer<typeof HarnessModelSettingsUpdateSchema>
export type HarnessModelConnectionFailure = z.infer<typeof HarnessModelConnectionFailureSchema>
export type HarnessModelConnectionCheckResult = z.infer<typeof HarnessModelConnectionCheckResultSchema>
export type HarnessModelProvider = z.infer<typeof HarnessModelProviderSchema>
export type HarnessModelProtocol = z.infer<typeof HarnessModelProtocolSchema>
export type HarnessCli = z.infer<typeof HarnessCliSchema>
export type HarnessCliModel = z.infer<typeof HarnessCliModelSchema>
export type HarnessSubscriptionSettings = z.infer<typeof HarnessSubscriptionSettingsSchema>
export type HarnessUpdateSubscriptionParams = z.infer<typeof HarnessUpdateSubscriptionParamsSchema>
export type HarnessSubscriptionStatus = z.infer<typeof HarnessSubscriptionStatusSchema>
export type HarnessModelEfforts = z.infer<typeof HarnessModelEffortsSchema>
export type HarnessModelSource = z.infer<typeof HarnessModelSourceSchema>
export type HarnessModelEntry = z.infer<typeof HarnessModelEntrySchema>
export type HarnessModelSourceGroup = z.infer<typeof HarnessModelSourceGroupSchema>
export type HarnessModelSourceInput = z.infer<typeof HarnessModelSourceInputSchema>
export type HarnessAddModelParams = z.infer<typeof HarnessAddModelParamsSchema>
export type HarnessSourceModel = z.infer<typeof HarnessSourceModelSchema>
export type HarnessSourceModels = z.infer<typeof HarnessSourceModelsSchema>
export type HarnessUpdateModelParams = z.infer<typeof HarnessUpdateModelParamsSchema>
export type ChatModelChoice = z.infer<typeof ChatModelChoiceSchema>
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>
export type ProjectOverview = z.infer<typeof ProjectOverviewSchema>
export type ProjectFields = z.infer<typeof ProjectFieldsSchema>
export type ListParams = z.infer<typeof ListParamsSchema>
export type FieldValue = z.infer<typeof FieldValueSchema>
export type ListResult = { rows: PaperRow[]; total: number }
export type SortKey = z.infer<typeof SortKeySchema>
export type SortDirection = z.infer<typeof SortDirectionSchema>
export type Task = z.infer<typeof TaskSchema>
export type TaskFields = z.infer<typeof TaskFieldsSchema>
export type TaskPatch = z.infer<typeof ProjectUpdateTaskParamsSchema>['patch']
export type TaskWindow = z.infer<typeof TaskWindowSchema>
export type Milestone = z.infer<typeof MilestoneSchema>
export type MilestoneFields = z.infer<typeof MilestoneFieldsSchema>
export type RelationGroup = z.infer<typeof RelationGroupSchema>
export type RelationFields = z.infer<typeof RelationFieldsSchema>
export type Attachment = z.infer<typeof AttachmentSchema>
export type AttachmentFields = z.infer<typeof AttachmentFieldsSchema>
export type TrashEntry = z.infer<typeof TrashEntrySchema>
export type Watch = z.infer<typeof WatchSchema>
export type WatchFields = z.infer<typeof WatchFieldsSchema>
export type AuthorIdentity = z.infer<typeof AuthorIdentitySchema>
export type NetFailure = z.infer<typeof NetFailureSchema>
export type NetFailed = z.infer<typeof NetFailedSchema>
export type AuthorSearchFailure = z.infer<typeof AuthorSearchFailureSchema>
export type AuthorSearchFailed = z.infer<typeof AuthorSearchFailedSchema>
export type CallFailure = z.infer<typeof CallFailureSchema>
export type CallRejection = z.infer<typeof CallRejectionSchema>
export type AuthorCandidate = z.infer<typeof AuthorCandidateSchema>
export type WatchTopicSuggestion = z.infer<typeof WatchTopicSuggestionSchema>
export type WatchAuthorSuggestion = z.infer<typeof WatchAuthorSuggestionSchema>
export type WatchSuggestionResult = z.infer<typeof WatchSuggestionResultSchema>
export type WatchSuggestionParams = z.infer<typeof WatchSuggestionParamsSchema>
export type InboxEntry = z.infer<typeof InboxEntrySchema>
export type InboxStream = z.infer<typeof InboxStreamSchema>
export type InboxListParams = z.infer<typeof InboxListParamsSchema>
export type InboxDownloadFailure = z.infer<typeof InboxDownloadFailureSchema>
export type InboxDownloadResult = z.infer<typeof InboxDownloadResultSchema>
export type DiscoveryIntent = z.infer<typeof DiscoveryIntentSchema>
export type DiscoveryProfile = z.infer<typeof DiscoveryProfileSchema>
export type DiscoveryFetchResult = z.infer<typeof DiscoveryFetchResultSchema>
export type DiscoveryIntentAction = z.infer<typeof DiscoveryIntentUpdateParamsSchema>['action']
export type DiscoveryFeedback = z.infer<typeof DiscoveryFeedbackParamsSchema>['feedback']
export type DeliverySettings = z.infer<typeof DeliverySettingsSchema>
export type LaterEntry = z.infer<typeof LaterEntrySchema>
export type ChangeEntry = z.infer<typeof ChangeEntrySchema>
export type DiffPiece = z.infer<typeof DiffPieceSchema>
export type RecordedChange = z.infer<typeof RecordedChangeSchema>
export type TrashedEntry = z.infer<typeof TrashedEntrySchema>
export type ProjectRecordedChange = z.infer<typeof ProjectRecordedChangeSchema>
export type OptionalRecordedChange = z.infer<typeof OptionalRecordedChangeSchema>
export type ReadingRecordedChange = z.infer<typeof ReadingRecordedChangeSchema>
export type ChangeSource = ChangeEntry['source']
export type FeedEntry = z.infer<typeof FeedEntrySchema>
export type FeedSource = FeedEntry['source']
export type FeedRun = z.infer<typeof FeedRunSchema>
export type FeedBriefItem = z.infer<typeof FeedBriefItemSchema>
export type GraphNode = z.infer<typeof GraphNodeSchema>
export type ResearchGraph = z.infer<typeof ResearchGraphSchema>
export type ProjectNextAction = z.infer<typeof ProjectNextActionSchema>
export type ProjectControl = z.infer<typeof ProjectControlSchema>
export type ProjectWorkspaceBinding = z.infer<typeof ProjectWorkspaceBindingSchema>
export type ProjectWorkspace = z.infer<typeof ProjectWorkspaceSchema>
export type SshFoldersParams = z.infer<typeof SshFoldersParamsSchema>
export type SshFolders = z.infer<typeof SshFoldersSchema>
export type AgentSession = z.infer<typeof AgentSessionSchema>
export type WikiKind = z.infer<typeof WikiKindSchema>
export type WikiRef = z.infer<typeof WikiRefSchema>
export type WikiAggregationCard = z.infer<typeof WikiAggregationCardSchema>
export type WikiCell = z.infer<typeof WikiCellSchema>
export type WikiColumn = z.infer<typeof WikiColumnSchema>
export type WikiRow = z.infer<typeof WikiRowSchema>
export type WikiRelated = z.infer<typeof WikiRelatedSchema>
export type WikiAggregation = z.infer<typeof WikiAggregationSchema>
export type WikiMembership = z.infer<typeof WikiMembershipSchema>
export type WikiPaper = z.infer<typeof WikiPaperSchema>
export type WikiHome = z.infer<typeof WikiHomeSchema>
export type ProposalOp = z.infer<typeof ProposalOpSchema>
export type ClaimOp = Extract<ProposalOp, { op: (typeof CLAIM_OPS)[number] }>
export type Proposal = z.infer<typeof ProposalSchema>
export type PageVersion = z.infer<typeof PageVersionSchema>
export type Evidence = z.infer<typeof EvidenceSchema>
export type ConflictTarget = z.infer<typeof ConflictTargetSchema>
export type WikiEvidence = z.infer<typeof WikiEvidenceSchema>
export type WikiConflict = z.infer<typeof WikiConflictSchema>
export type WikiClaim = z.infer<typeof WikiClaimSchema>
export type WikiSignalKind = z.infer<typeof WikiSignalKindSchema>
export type WikiSignal = z.infer<typeof WikiSignalSchema>
export type WikiBacklink = z.infer<typeof WikiBacklinkSchema>
export type AgentProposal = z.infer<typeof AgentProposalSchema>
export type ProposalRecord = z.infer<typeof ProposalRecordSchema>
export type WikiProposal = z.infer<typeof WikiProposalSchema>
export type ProposalReceipt = z.infer<typeof ProposalReceiptSchema>
export type ProposalStatus = ProposalRecord['status']
export type ChatRun = z.infer<typeof ChatRunSchema>
export type ChatAction = z.infer<typeof ChatActionSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ChatAnswerModel = z.infer<typeof ChatAnswerModelSchema>
export type ChatWriting = z.infer<typeof ChatWritingSchema>
export type ChatMessageFields = z.infer<typeof ChatMessageFieldsSchema>
export type ChatSession = z.infer<typeof ChatSessionSchema>
export type ChatSendResult = z.infer<typeof ChatSendResultSchema>
export type HarnessFailureDetail = z.infer<typeof HarnessFailureDetailSchema>
export type ChatCancelResult = z.infer<typeof ChatCancelResultSchema>
export type ResearchIdea = z.infer<typeof ResearchIdeaSchema>
export type IdeaRelations = z.infer<typeof IdeaRelationsSchema>
export type ResearchIdeaPatch = z.infer<typeof ResearchIdeaUpdateParamsSchema>['patch']
export type ResearchIdeaPromoteResult = z.infer<typeof ResearchIdeaPromoteResultSchema>
export type ResearchIdeaGraphPlacement = z.infer<typeof ResearchIdeaGraphPlacementSchema>
export type ResearchIdeaPlaceOnGraphResult = z.infer<typeof ResearchIdeaPlaceOnGraphResultSchema>
export type SearchHit = z.infer<typeof SearchHitSchema>
export type SearchAnchor = z.infer<typeof SearchAnchorSchema>
export type FeedFields = z.infer<typeof FeedAppendParamsSchema>
export type LibrarySource = z.infer<typeof LibrarySourceSchema>
export type LibraryLocation = z.infer<typeof LibraryLocationSchema>
export type LibraryBackup = z.infer<typeof LibraryBackupSchema>
export type LibraryResetResult = z.infer<typeof LibraryResetResultSchema>
export type ExtensionClient = z.infer<typeof ExtensionClientSchema>
export type ExtensionStatus = z.infer<typeof ExtensionStatusSchema>
export type PluginVersion = z.infer<typeof PluginVersionSchema>
export type SemanticKeyStatus = z.infer<typeof SemanticKeyStatusSchema>
export type SemanticKeyCheckResult = z.infer<typeof SemanticKeyCheckResultSchema>
export type ColourThemeModules = z.infer<typeof ColourThemeModulesSchema>
export type ColourTheme = z.infer<typeof ColourThemeSchema>
export type ColourThemeProblem = z.infer<typeof ColourThemeProblemSchema>
export type ColourThemeFile = z.infer<typeof ColourThemeFileSchema>

/** Facet value with paper count and title of the newest matching paper. */
export type Facet = { value: string; count: number; newestTitle: string }

/** Contract method-name set used by Core routing and exhaustive tests. */
export const CONTRACT_METHODS = [
  'library.location',
  'library.configure',
  'library.reset',
  'library.backups',
  'library.switchBackup',
  'library.deleteBackup',
  'extensions.status',
  'extensions.checkLatest',
  'extensions.pluginVersion',
  'delivery.semanticKey',
  'delivery.setSemanticKey',
  'delivery.checkSemanticKey',
  'themes.list',
  'themes.save',
  'themes.delete',
  'vault.today',
  'papers.list',
  'papers.facets',
  'papers.get',
  'papers.update',
  'papers.setTopic',
  'papers.delete',
  'papers.source',
  'papers.import',
  'papers.retryMetadata',
  'papers.fillPublication',
  'papers.reading',
  'papers.mutateReading',
  'harness.prepare',
  'harness.pendingPaperWiki',
  'harness.start',
  'harness.cancel',
  'harness.dismissFailure',
  'harness.modelSettings',
  'harness.updateModelSettings',
  'harness.checkModelConnection',
  'harness.updateSubscription',
  'harness.subscriptionStatus',
  'harness.sourceModels',
  'harness.addModel',
  'harness.updateModel',
  'harness.removeModel',
  'harness.setDefaultModel',
  'harness.applyPaperWiki',
  'harness.rejectPaperWiki',
  'papers.columns',
  'papers.setColumns',
  'papers.renameOption',
  'papers.setColumnType',
  'project.list',
  'project.overview',
  'project.create',
  'project.get',
  'project.bindWorkspace',
  'ssh.hosts',
  'ssh.folders',
  'project.update',
  'project.delete',
  'project.createTask',
  'project.updateTask',
  'project.deleteTask',
  'project.reorderTasks',
  'project.setTaskNode',
  'project.createMilestone',
  'project.updateMilestone',
  'project.deleteMilestone',
  'project.createRelation',
  'project.deleteRelation',
  'project.updateRelation',
  'project.addPaper',
  'project.removePaper',
  'project.moveRelation',
  'project.reorder',
  'project.createAttachment',
  'project.deleteAttachment',
  'project.createConclusion',
  'project.setConclusionState',
  'project.deleteConclusion',
  'project.verifyConclusion',
  'project.unverifyConclusion',
  'inbox.list',
  'inbox.dismiss',
  'inbox.readLater',
  'inbox.download',
  'inbox.fetch',
  'delivery.settings',
  'delivery.updateSettings',
  'discovery.profiles',
  'discovery.fetch',
  'discovery.intent',
  'discovery.feedback',
  'later.list',
  'later.remove',
  'watch.list',
  'author.search',
  'watch.suggest',
  'watch.create',
  'watch.update',
  'watch.setActive',
  'watch.delete',
  'wiki.home',
  'wiki.aggregation',
  'wiki.paper',
  'wiki.cards',
  'wiki.apply',
  'wiki.update',
  'wiki.propose',
  'wiki.proposals',
  'wiki.decide',
  'wiki.signals',
  'wiki.backlinks',
  'trash.list',
  'trash.restore',
  'trash.purge',
  'trash.clear',
  'changelog.list',
  'changelog.undo',
  'changelog.archive',
  'changelog.archiveAll',
  'changelog.delete',
  'changelog.clearArchived',
  'feed.list',
  'feed.append',
  'chat.list',
  'chat.messages',
  'chat.create',
  'chat.forPaper',
  'chat.append',
  'chat.send',
  'chat.retry',
  'chat.cancel',
  'chat.writing',
  'chat.failure',
  'chat.model',
  'chat.setModel',
  'idea.list',
  'idea.create',
  'idea.update',
  'idea.promote',
  'idea.placeOnGraph',
  'idea.delete',
  'idea.reorder',
  'chat.recordAction',
  'chat.setArchived',
  'chat.rename',
  'chat.delete',
  'search.query',
  'jobs.status',
] as const

export type ContractMethod = (typeof CONTRACT_METHODS)[number]
