import type {
  AttachmentFields, ChangeEntry, ChatMessage, ChatMessageFields, ChatSession, ConclusionState, Facet,
  DeliverySettings, DiscoveryFeedback, DiscoveryIntentAction, DiscoveryProfile, FeedEntry, FeedFields,
  InboxDownloadResult, InboxEntry,
  InboxListParams, LaterEntry, ListParams, ListResult,
  GraphNode, MilestoneFields,
  PaperCell, PaperColumn, PaperColumns,
  PaperFields, PaperImportResult, PaperReading, PaperRow, Proposal, ProjectDetail, ProjectFields,
  ProjectOverview, ProjectSummary, ProjectWorkspaceBinding, ReadingMutation,
  RelationFields, ResearchIdea, SearchHit,
  TaskFields, TaskPatch, TrashEntry, Watch, WatchFields, WikiAggregation, WikiAggregationCard, WikiHome,
  WikiPaper,
} from '../shared/contract.js'
import type { PageText, PaperSnapshot } from './vault/records.js'
import type { RemotePaper } from './net/arxiv.js'
import type {
  DiscoveryPaper, DiscoverySchedule, RecommendationIntent, RecommendationProfile,
} from './recommendation/index.js'
import type { ResearchIdeaMutation } from './research-ideas/index.js'

export type DiscoverySeeds = { positive: string[]; negative: string[] }

/**
 * The vault-backed data operations Core exposes over the contract, plus the
 * primitives undo and restoring from the trash need — paperSnapshot, putPaper,
 * putProject, readPages, putPages, paperCells, putPaperColumn and trashedPaper —
 * which no contract method reaches. A fixture implementation backs tests and
 * early UI work; a disk-backed implementation replaces it without changing
 * callers.
 */
/** Bibliographic fields written by one enrichment pass; omit fields that were not found. */
export type MetadataFill = {
  title?: string
  authors?: string[]
  year?: number
  venue?: string
  identifier?: string
  submitted?: string
  abstract?: string
  pageCount?: number
}

export interface VaultStore {
  /**
   * Returns the vault's today as an ISO date. Every relative date the screens
   * show is measured from it, every write the vault dates takes it, and the
   * trash counts its retention from it. It is read afresh on each call and may
   * advance while the application runs, so callers re-read it rather than
   * holding one value for a session: a caller comparing a stale today against
   * a stamp the vault wrote after midnight would be a day out. Every write
   * calls it, so it has to stay cheap.
   */
  today(): string

  /**
   * Returns one page of the vault's papers, and how many papers that page was
   * drawn from. `page` counts from 1 and `size` is how many rows a full page
   * holds, so the last page may hold fewer and a page past the last holds
   * none; `total` counts every paper the filter and the facet leave, not the
   * rows returned. A filter keeps the papers whose title, one of whose authors,
   * one of whose topics or one of whose project names contains it, compared without case;
   * a facet keeps the papers whose
   * named field carries the given value, the field being a built-in groupable
   * one or a select or multi column's key; given both, a paper has to satisfy
   * both. Rows come sorted by `sort`, by title when that is absent, in
   * `direction`, ascending when that is absent; sorted by date added, year or
   * first author, the papers carrying none come after every paper that carries
   * one, in both directions.
   */
  listPapers(params: ListParams): ListResult

  /**
   * Returns every value the given field takes across the listed papers, sorted
   * by value, each with the number of papers carrying it and the title of the
   * newest of those papers — newest by publication year, and among papers
   * sharing that year the first in vault order; a paper carrying no year is
   * never the newest unless no paper under that value carries one, and then
   * the first in vault order stands. A filter narrows the counted papers by
   * the same rule listPapers applies to its own filter. `field` is one of the
   * built-in groupable fields or a select or multi column's key; anything else
   * throws.
   */
  facetPapers(field: string, filter?: string): Facet[]

  /** Returns the paper with the given id. Throws if no such paper exists. */
  getPaper(id: string): PaperRow

  /**
   * Merges patch into the paper with the given id and stamps it as updated
   * today, the write itself being what makes that true. The patch carries only
   * the fields the screens can edit; what the source states and what the vault
   * aggregates are not writable, and neither is the stamp — core writes it.
   * Throws if no such paper exists. A patch's `custom` names only the cells it
   * changes: each takes the value given, null emptying it, and every cell it
   * does not name stays as the vault holds it when the write lands. A cell it
   * sets to a value the paper does not carry has to name a column the vault
   * holds and match that column's type and options; throws otherwise. A cell it
   * empties, or sets to the value it carries, passes whatever it names.
   */
  updatePaper(id: string, patch: Partial<PaperFields>): void

  /**
   * Returns what putPaper takes to leave the paper with the given id exactly as
   * it stands: the fields the screens can edit and the stamp core writes over
   * them, carrying no reading state at all when the vault records none for that
   * paper. Undo keeps one of these from before each paper write, and no
   * contract method reaches it. Throws if no such paper exists.
   */
  paperSnapshot(id: string): PaperSnapshot

  /**
   * Puts the paper with the given id back as the given snapshot has it,
   * changing only what differs from what the vault records now — a snapshot
   * carrying no reading state takes the vault's own back off, so a paper that
   * never carried one goes back to carrying none rather than to reading unread.
   * Undo writes a snapshot back through it, and no contract method reaches it.
   * Throws if no such paper exists.
   */
  putPaper(id: string, snapshot: PaperSnapshot): void

  /**
   * Moves the paper with the given id into the trash; it cannot be read or
   * listed afterwards, and restoring its trash entry brings it back. Throws if
   * no such paper exists. What paperReading returns for it goes into the trash
   * with it and comes back when the entry is restored; purging the entry or
   * clearing the trash drops it.
   */
  deletePaper(id: string): void

  /**
   * Returns the bytes of the original PDF the vault stores for the paper with
   * the given id, as a fresh copy owned by the caller. The paper's page names
   * the original it stands for, and the vault keeps that original under
   * `sources/papers` in the file whose name starts with the original's id and
   * a hyphen, so two papers naming the same original read the same bytes.
   * Throws if no such paper exists, or the vault stores no original for it.
   */
  paperSource(id: string): Uint8Array

  /**
   * Imports one PDF. Its source identity is derived from the bytes, the
   * immutable source is stored once, and when no page already names that source
   * a draft paper page is created in the unread state. The later queue is not
   * touched. Reimporting identical bytes returns that existing paper without
   * writing anything.
   */
  importPaper(filename: string, bytes: Uint8Array): PaperImportResult

  /**
   * Fills bibliographic fields found for the paper with the given id and
   * returns the names of the fields it wrote, in MetadataFill's order. Only
   * fields the paper does not carry yet are written; the title is written only
   * while the paper's title equals `replaceTitle`, never when that is null.
   * When anything is written the paper is stamped updated today, and each
   * later-queue entry naming the same original takes the new title when the
   * title was written, and the paper's authors, venue and abstract where its
   * own are empty. Records no change. Throws if no such paper exists.
   */
  fillPaperMetadata(id: string, fill: MetadataFill, replaceTitle: string | null): string[]

  /** Returns the user's persisted highlights, notes, remark and last page read for one paper. */
  paperReading(id: string): PaperReading

  /**
   * Applies one semantic reading command, assigning IDs and dates in Core,
   * persists the resulting state atomically, and returns its new snapshot. A
   * remark.set replaces the paper's one remark (an empty text clears it); a
   * progress.set records the last page read. The paper's row carries a
   * non-empty remark as `remark`.
   */
  mutatePaperReading(id: string, mutation: ReadingMutation): PaperReading

  /** Returns the paper table's column configuration: hidden built-in columns and custom columns. */
  paperColumns(): PaperColumns

  /**
   * Replaces the column configuration. Throws if a hidden key is not a built-in column or is a
   * locked one, a custom key is empty, repeats, starts with `-`, collides with a built-in
   * column key, the title column's `t` or a groupable field name, or holds anything but
   * `[A-Za-z0-9_-]`; a custom label is empty or repeats; a text column carries options; an
   * option is blank or repeats within its column; a paper still holds a cell the given columns
   * could not have been filled through — which is what refuses dropping an option in use and
   * changing a column's type under filled cells; or `groups` repeats a key or names something
   * that is neither a groupable built-in nor a select or multi column.
   */
  setPaperColumns(columns: PaperColumns): void

  /**
   * Renames one option of a select or multi column: the column's own options, and the cell of
   * every paper holding that option, each such paper stamped updated today. Throws if the key
   * names no select or multi column, `from` is not one of its options, or `to` is blank or
   * already one of them.
   */
  renamePaperOption(key: string, from: string, to: string): void

  /**
   * Retypes the custom column `key` to `type`: the column's options, the groups when it goes to
   * text, and the cell of every paper holding one in it change by the rules retypedColumn in
   * paper-library/columns.ts states, each paper whose cell changes stamped updated today. Throws, writing
   * nothing, if the key names no custom column, the column already has that type, or it goes from
   * multi to select while some papers hold more than one value in it.
   */
  setPaperColumnType(key: string, type: PaperColumn['type']): void

  /**
   * Returns, by paper id, the cell each paper holding one holds in `key`. Undo reads it to tell
   * whether a column's cells still stand as a recorded write left them, and no contract method
   * reaches it.
   */
  paperCells(key: string): Record<string, PaperCell>

  /**
   * Puts `column` back under its key and `cells` back as the cells papers hold in it — a paper
   * `cells` names none for holding none — each paper whose cell changes stamped updated today; when
   * `groupAt` is not null and the groups lack the key, the key goes back into the groups at that
   * place. Nothing is validated. Undo writes a retype back through it, and no contract method
   * reaches it. Throws if no custom column holds that key.
   */
  putPaperColumn(column: PaperColumn, groupAt: number | null, cells: Record<string, PaperCell>): void

  /**
   * Returns a summary of every project in project order: the project's own
   * fields, the date and done flag of each of its milestones in the order it
   * holds them, and the last three events it holds, in that same order.
   * Project order follows reorderProjects's manual order for the projects it
   * names; every other project falls back to the day it was created, earliest
   * first, with same-day projects ordered by id, each run of digits in an id
   * compared as a number so the tenth project follows the second rather than
   * preceding it.
   */
  listProjects(): ProjectSummary[]

  /**
   * Sets the manual order listProjects (and overviewProjects) return projects in. Ids the vault
   * does not hold are ignored; a project absent from `order` keeps its place in the fallback order,
   * after every project `order` does name.
   */
  reorderProjects(order: readonly string[]): void

  /**
   * Returns every project in project order — the same order listProjects gives
   * — with the fields the research overview reads: the project's own fields,
   * and its tasks, milestones and events in the order it holds them. The overview
   * renders those task dates directly; a project's start/due range is not a task.
   */
  overviewProjects(): ProjectOverview[]

  /**
   * Creates a project carrying the given name, assigns it an id unused by the
   * vault, and appends it after the projects already there. It starts active,
   * takes the vault's today as its start date and a due date no earlier than
   * that, and carries placeholder text for its topic and its focus, both of
   * which the screens show before you have chosen either. It holds no tasks,
   * milestones, relations, attachments or agent sessions, its research graph
   * is empty, and it holds exactly one event, dated today, recording that it
   * was created.
   */
  createProject(name: string): void

  /**
   * Returns the project with the given id, its tasks, milestones, relations,
   * attachments, agent sessions and research-graph nodes in the order the
   * vault holds them. Throws if no such project exists, or its research graph
   * holds an edge either of whose ends is not among its nodes.
   */
  getProject(id: string): ProjectDetail

  /**
   * Connects a project to a local or SSH repository and materializes the App-owned planning
   * surface. Passing null only removes the connection; files already in the repository remain.
   */
  bindProjectWorkspace(id: string, binding: ProjectWorkspaceBinding | null): ProjectDetail

  /**
   * Merges patch into the project with the given id, keeping its place among
   * the projects, and returns the updated project. The patch carries only the
   * project's own fields; its tasks, milestones and events are written through
   * their own methods. Throws if no such project exists, or the merged
   * project's due date precedes its start date; a rejected patch leaves the
   * project untouched. A `block` of null removes the project's blocker.
   */
  updateProject(id: string, patch: Partial<ProjectFields>): ProjectDetail

  /**
   * Moves the project with the given id into the trash; it can no longer be
   * read or listed, and restoring its trash entry brings it back. Throws if no
   * such project exists.
   */
  deleteProject(id: string): void

  /**
   * Appends a task built from the given fields to the project with the given
   * projectId, assigning it an id unused by that project, and returns the
   * updated project. Throws if no such project exists, or the task's end date
   * precedes its start date.
   */
  createTask(projectId: string, task: TaskFields): ProjectDetail

  /**
   * Merges patch into the task with the given taskId inside the project with
   * the given projectId, keeping it in its place among that project's tasks,
   * and returns the updated project. The patch carries only the task's own
   * fields; its id is not writable. Throws if no such project exists, no such
   * task exists inside it, or the merged task's end date precedes its start
   * date; a rejected patch leaves the task untouched.
   */
  updateTask(projectId: string, taskId: string, patch: TaskPatch): ProjectDetail

  /**
   * Removes the task with the given taskId from the project with the given
   * projectId and returns the updated project. Throws if no such project
   * exists, or no such task exists inside it.
   */
  deleteTask(projectId: string, taskId: string): ProjectDetail

  /**
   * Reorders the project with the given projectId's tasks to match `order`, its one stored task
   * order read by both the task list and the Gantt chart. Returns the updated project. Throws if no
   * such project exists, or `order` is not exactly a permutation of the project's current task ids.
   */
  reorderTasks(projectId: string, order: readonly string[]): ProjectDetail

  /**
   * Appends a milestone built from the given fields to the project with the
   * given projectId, assigning it an id unused by that project, and returns
   * the updated project. Throws if no such project exists.
   */
  createMilestone(projectId: string, milestone: MilestoneFields): ProjectDetail

  /**
   * Merges patch into the milestone with the given milestoneId inside the
   * project with the given projectId, keeping it in its place among that
   * project's milestones, and returns the updated project. The patch carries
   * only the milestone's own fields; its id is not writable. Throws if no such
   * project exists, or no such milestone exists inside it.
   */
  updateMilestone(
    projectId: string, milestoneId: string, patch: Partial<MilestoneFields>,
  ): ProjectDetail

  /**
   * Removes the milestone with the given milestoneId from the project with the
   * given projectId and returns the updated project. Throws if no such project
   * exists, or no such milestone exists inside it.
   */
  deleteMilestone(projectId: string, milestoneId: string): ProjectDetail

  /**
   * Appends a relation item carrying the given text to the group the given
   * fields name inside the project with the given projectId, assigning it an
   * id unused by that project, and returns the updated project. A group name
   * the project does not yet carry becomes a new last group. A page has to
   * name an aggregation the vault holds. Throws if no such project or
   * aggregation exists.
   */
  createRelation(projectId: string, relation: RelationFields): ProjectDetail

  /**
   * Removes the relation item with the given relationId from the project with
   * the given projectId and returns the updated project. The group it sat in
   * stays, empty. Throws if no such project exists, or no such relation item
   * exists inside it.
   */
  deleteRelation(projectId: string, relationId: string): ProjectDetail

  /** Links an existing paper to a project. */
  addPaper(projectId: string, paperId: string): ProjectDetail

  /** Removes a recorded paper id from a project, even if the paper is currently trashed. */
  removePaper(projectId: string, paperId: string): ProjectDetail

  /**
   * Moves a linked paper or a relation item to `index` among its row's siblings, clamped to the row.
   * Throws when neither a linked paper nor a relation item has that id.
   */
  moveRelation(projectId: string, id: string, index: number): ProjectDetail

  /**
   * Appends an attachment built from the given fields to the project with the
   * given projectId, assigning it an id unused by that project, and returns
   * the updated project. The attachment records the file's absolute path; the
   * file is not copied. Throws if no such project exists or the path is not
   * absolute.
   */
  createAttachment(projectId: string, attachment: AttachmentFields): ProjectDetail

  /**
   * Moves the attachment with the given attachmentId out of the project with
   * the given projectId and into the trash, and returns the updated project.
   * Restoring its trash entry appends it back to that project. Throws if no
   * such project exists, or no such attachment exists inside it.
   */
  deleteAttachment(projectId: string, attachmentId: string): ProjectDetail

  /**
   * Appends an event carrying the given text, dated the vault's today, after
   * the events the project with the given projectId already holds, and returns
   * the updated project. Throws if no such project exists, or the text carries
   * a newline — one event is one line, so a text spanning lines is rejected
   * rather than silently cut short; a rejected text leaves the project
   * untouched. A `node` attaches the event to that research-graph node and
   * must name a node in the project.
   */
  createEvent(projectId: string, text: string, node?: string): ProjectDetail

  /**
   * Adds a node labelled `label` to the project's research graph, placed by
   * placeNode and optionally joined from `after`. Node edits are not recorded
   * as undoable project changes. Throws if the project or `after` node is absent.
   */
  createNode(projectId: string, label: string, after: string | null): ProjectDetail

  /**
   * Merges `patch` into a research-graph node without moving it. Node edits
   * are not recorded as undoable project changes. Throws if the project or node is absent.
   */
  updateNode(
    projectId: string, nodeId: string, patch: Partial<Pick<GraphNode, 'label' | 'state'>>,
  ): ProjectDetail

  /**
   * Removes a research-graph node and every edge touching it. Existing event
   * text remains. Node edits are not recorded as undoable project changes.
   */
  deleteNode(projectId: string, nodeId: string): ProjectDetail

  /**
   * Writes one line from a project's research node back to a wiki aggregation
   * page: appends `- <today> · <text>` to that page's first appendable section
   * and records `{ page, text, date: today }` on the node. Returns the project.
   * Throws if the project, node or page does not exist, or `text` is empty or
   * spans lines.
   */
  writeBack(id: string, node: string, page: string, text: string): ProjectDetail

  /** Appends a pending conclusion to a project. This research-state write is not undoable. */
  createConclusion(
    projectId: string, text: string, from: { chat?: string; paper?: string },
  ): ProjectDetail

  /** Changes one project conclusion's state. This research-state write is not undoable. */
  setConclusionState(
    projectId: string, conclusionId: string, state: ConclusionState,
  ): ProjectDetail

  /** Removes one project conclusion. This research-state write is not undoable. */
  deleteConclusion(projectId: string, conclusionId: string): ProjectDetail

  /**
   * Returns the inbox entries a watch brought in and that have not left the
   * inbox, in vault order. Entries the same watch brought in sit next to each
   * other in that order. Each entry names the original it stands for; where
   * the vault holds a page for that original the entry carries that page's id
   * instead, which is what opening the original goes by, and where more than
   * one page names it the first in vault order stands.
   */
  listInbox(params?: InboxListParams): InboxEntry[]

  /**
   * Moves the inbox entry with the given id into the trash; it leaves the
   * inbox, and restoring its trash entry puts it back where it sat. Throws if
   * the inbox holds no such entry.
   */
  dismissInbox(id: string): void

  /**
   * Moves the inbox entry with the given id out of the inbox and into the
   * later queue, and returns whether this call is what queued it: an entry the
   * queue already holds leaves the inbox without being queued twice. A queued
   * entry carries over the entry's own source and PDF address, and takes the vault's today as
   * the date it was added. Throws if the inbox holds no such entry.
   */
  readLater(id: string): boolean

  /** Returns whether an inbox entry needs its PDF fetched or already exists in the library. */
  prepareInboxDownload(id: string): { kind: 'fetch'; url: string } | InboxDownloadResult

  /** Stores a fetched inbox PDF through the immutable import path and applies its saved metadata. */
  completeInboxDownload(id: string, bytes: Uint8Array): InboxDownloadResult

  /**
   * Returns the later queue, the most recently added entry first; entries
   * added on the same day — every entry carries the day it was added, not the
   * moment — keep that same order among themselves, the most recently added
   * one first. An entry reads as downloaded while the vault holds a page
   * naming the original it stands for, and then carries that page's id, by the
   * same rule listInbox follows.
   */
  listLater(): LaterEntry[]

  /**
   * Removes the entry with the given id from the later queue. It does not go
   * to the trash. Throws if the queue holds no such entry.
   */
  removeLater(id: string): void

  /** Returns the watches in vault order. */
  listWatches(): Watch[]

  /**
   * Creates an active watch carrying the given fields, assigns it an id unused
   * by the vault, and appends it after the watches already there.
   */
  createWatch(watch: WatchFields): void

  /**
   * Replaces the query fields of an existing watch without replacing its id,
   * active state, or already-fetched inbox entries. The watch type is stable.
   */
  updateWatch(id: string, watch: WatchFields): void

  /**
   * Sets whether the watch with the given id is active. An inactive watch
   * brings in nothing new; what it already brought in stays. Throws if no such
   * watch exists.
   */
  setWatchActive(id: string, active: boolean): void

  /**
   * Removes the watch with the given id and the inbox suggestions it brought
   * in, including dismissed suggestions that only existed to be restorable.
   * Papers already downloaded into the vault and entries already copied into
   * the later queue stay there. Throws if no such watch exists.
   */
  deleteWatch(id: string): void

  /** Returns the common limits used by watch fetching and project discovery. */
  deliverySettings(): DeliverySettings

  /** Replaces the common paper-delivery settings. */
  setDeliverySettings(settings: DeliverySettings): void

  /** Adds at most `limit` unseen arXiv results for one watch and returns their arXiv ids. */
  addInboxEntries(watchId: string, found: RemotePaper[], limit?: number): string[]

  /** Refreshes ranking/venue metadata for inbox history belonging to one watch. */
  updateInboxEntries(watchId: string, found: RemotePaper[]): number

  /** Active projects and the seed/feedback counts that can drive their discovery feeds. */
  listDiscoveryProfiles(): DiscoveryProfile[]

  /** Multi-source ids passed to the recommendation provider for one project profile. */
  discoverySeeds(projectId: string): DiscoverySeeds

  /** Project papers plus explicit feedback, with text needed for intent clustering. */
  discoveryProfile(projectId: string): RecommendationProfile

  /** Derived directions with user-owned core and enable preferences applied. */
  discoveryIntents(projectId: string): RecommendationIntent[]

  /** Persisted fairness state for bounded project and direction scheduling. */
  discoverySchedule(projectId: string): DiscoverySchedule

  /** Advances one project's refresh time and secondary-intent rotation cursor. */
  setDiscoverySchedule(projectId: string, schedule: DiscoverySchedule): void

  /** Persists one user-owned core/enable decision without mutating Wiki knowledge. */
  setDiscoveryIntent(projectId: string, intentId: string, action: DiscoveryIntentAction): void

  /** Adds at most `limit` unseen provider results to one project's discovery feed. */
  addDiscoveryEntries(projectId: string, found: DiscoveryPaper[], limit?: number): number

  /** Persists explicit discovery feedback; less/known items leave the visible feed. */
  feedbackDiscovery(id: string, feedback: DiscoveryFeedback): void

  /** Returns the last completed full fetch time, or null before any full fetch. */
  lastFetch(): number | null

  /** Persists the completion time of a full watch fetch. */
  setLastFetch(at: number): void

  /**
   * Returns the wiki home: how many aggregations the vault holds, each kind
   * the schema declares with its count, the aggregations lint has a finding on
   * (at most three, the first finding as the reason), and a card for every
   * aggregation without a parent — kinds in schema order, cards in id order.
   */
  wikiHome(): WikiHome

  /**
   * Returns the aggregation with the given id: its card, its parents, the cards
   * of its children, its comparison table — one row per member paper in id
   * order, cells keyed by column — the aggregations of every other kind its
   * members also belong to, and its body. Throws if no such aggregation exists.
   */
  wikiAggregation(id: string): WikiAggregation

  /**
   * Returns the paper page with the given id — `papers/` followed by the id of
   * a row `listPapers` gives: the fields its frontmatter carries, its body, and
   * one membership per aggregation it belongs to with the cells it fills there.
   * Every listed paper has a page. Throws if no such paper exists.
   */
  wikiPaper(id: string): WikiPaper

  /**
   * Returns a card for every aggregation, kinds in schema order and cards in
   * id order.
   */
  wikiCards(): WikiAggregationCard[]

  /**
   * Returns the labels of the schema's appendable sections in order.
   */
  wikiSections(): string[]

  /**
   * Applies a proposal: every op in order, each seeing the effect of the ones
   * before it, none of them written unless all of them are valid — the
   * validity rules are applyProposal's in core/wiki. A membership op
   * writes the paper's page, the other ops write the aggregation's page, and
   * every aggregation whose members or children the proposal changed gets its
   * generated regions rewritten. Every written page is stamped updated today.
   * The proposal is validated again here even when `proposalPages` already
   * validated it: the store does not assume its caller did.
   * Throws if an op is not valid.
   */
  applyProposal(proposal: Proposal): void

  /**
   * Replaces the body of the wiki page with the given id — every line after
   * its last generated region, or after its frontmatter when it has none —
   * and stamps the page updated today. Throws if the vault holds no such page,
   * or `body` carries a generated-region marker line.
   */
  updateWikiPage(id: string, body: string): void

  /**
   * Applies a Harness paper-wiki proposal: replaces the paper page's body the way updateWikiPage does
   * and, in that same write, sets `validation_state` to `text_converged` and `trust_state` to
   * `source_grounded_text` — the two keys retrieval requires before it will surface the page. Stamps
   * the page updated today. Throws if the vault holds no such page, or `body` carries a
   * generated-region marker line.
   */
  applyPaperWikiDraft(id: string, body: string): void

  /**
   * Returns the text of each page named, in the order named, a page the vault
   * does not hold carrying null.
   */
  readPages(paths: string[]): PageText[]

  /**
   * Returns the id of every page applying `proposal` would write, in the order
   * first written: the pages its ops name, then every aggregation whose
   * generated regions the apply refills. Throws if the proposal is not valid
   * against the vault as it stands.
   */
  proposalPages(proposal: Proposal): string[]

  /**
   * Puts the given page texts back as they are, a null text removing that page.
   * Each page is replaced whole; the write is atomic per page.
   */
  putPages(pages: PageText[]): void

  /**
   * Returns the trash entries that are still within the retention period, the
   * most recently deleted one first; entries deleted on the same day — every
   * entry carries the day it was deleted, not the moment — keep that same
   * order among themselves, the most recently deleted one first. An entry is
   * within the retention period while fewer than TRASH_RETENTION_DAYS days
   * separate the day it was deleted from the vault's today, so the entry
   * deleted exactly that many days ago is already out; an entry whose
   * retention has run out is dropped along with what it holds, so it is
   * neither listed nor restorable. Each entry's `restorable` says whether it
   * can go back right now: only an attachment can be unrestorable, and only
   * while the project it was deleted from is itself deleted.
   */
  listTrash(): TrashEntry[]

  /**
   * Puts what the trash entry with the given id holds back where it was
   * deleted from and drops the entry. Throws if no such entry exists, which
   * includes one whose retention has run out, and throws for an attachment
   * whose project is no longer in the vault — that entry stays in the trash,
   * restorable again once the project is. Restoring never discards what the
   * entry holds and never puts it anywhere but where it came from. A paper put
   * back holding cells some column as the vault holds it now could not have been
   * filled through then has those cells emptied through updatePaper, recorded as
   * a change of its own; a paper whose cells all fit is written nothing more.
   */
  restoreTrash(id: string): void

  /**
   * Returns the id of the paper the trash entry with the given id holds, or
   * undefined when the trash holds no such entry or the entry holds something
   * other than a paper. Restoring reads it to know which paper comes back, and
   * no contract method reaches it.
   */
  trashedPaper(id: string): string | undefined

  /**
   * Drops the trash entry with the given id and what it holds; it can no
   * longer be restored. Throws if no such entry exists, which includes one
   * whose retention has run out.
   */
  purgeTrash(id: string): void

  /** Drops every trash entry and what they hold; none can be restored. */
  clearTrash(): void

  /**
   * Puts the given project back as it stands, replacing every field the vault
   * stores for a project and keeping its place among the projects; what the
   * vault holds about the project beyond those fields — when it was created —
   * stays. Undo writes a snapshot back through it, and no contract method
   * reaches it. Throws if no project with that id exists.
   */
  putProject(project: ProjectDetail): void

  /**
   * Returns the change entries, the most recently recorded one first. Every
   * write that changes the vault's lasting knowledge is recorded here by core
   * itself; the inbox, later-queue, watch, chat and feed writes are not, being
   * what comes in rather than what the vault knows, and neither are the trash
   * writes, the trash being a way back of its own.
   */
  listChanges(): ChangeEntry[]

  /**
   * Undoes the change entry with the given id: the entity that entry recorded
   * goes back to how it stood before that write, which for a write that emptied
   * into the trash means restoring that trash entry and for a project that write
   * created means deleting it again. The entry stays, marked undone, and the undo
   * is recorded as an entry of its own, which is history and not itself
   * undoable. Throws if no such entry exists, it is already undone, the vault
   * never held what it takes to undo it, its snapshot has outlived the retention
   * the trash counts by, or the entity no longer stands as that write left it —
   * writing the snapshot back would drop whatever changed it since, so it is
   * refused and says how many later entries touch that same entity. A paper's
   * undo also throws, writing nothing, when its snapshot holds a cell some column
   * as the vault holds it now could not have been filled through — a column
   * retyped or its options renamed since — naming the first such column.
   * Undoing a paper's deletion puts the paper back the way restoreTrash does,
   * emptying the cells that no longer fit the same way.
   */
  undoChange(id: string): void

  /**
   * Archives the change entry with the given id: the entry stays and reads the
   * same, and only stops counting as one you have yet to look at. Archiving is
   * not itself recorded as a change, and an entry already archived is left as
   * it stands. Throws if no such entry exists.
   */
  archiveChange(id: string): void

  /**
   * Archives every change entry not already archived. Records nothing, and does
   * nothing when they are all archived already.
   */
  archiveAllChanges(): void

  /**
   * Permanently removes one change record and its undo snapshot. This only
   * clears Meridian's application changelog; it does not edit canonical wiki
   * pages or the append-only wiki activity log. Throws if the id is unknown.
   */
  deleteChange(id: string): void

  /** Permanently removes every archived change record and keeps active ones. */
  clearArchivedChanges(): void

  /**
   * Returns the feed entries in the order the vault holds them, oldest first.
   * Entries carrying the same day sit next to each other in that order.
   */
  listFeed(): FeedEntry[]

  /**
   * Appends a feed entry built from the given fields. It takes an id unused by
   * the vault, the day bucket the vault's today falls in, and an exact creation
   * timestamp from which the renderer derives a live relative time.
   */
  appendFeed(entry: FeedFields): void

  /**
   * Returns visible chat sessions, the most recently created one first. A
   * paper discussion stays out of the global list until it has a message.
   */
  listChats(): ChatSession[]

  /**
   * Returns the messages of the session with the given id, oldest first.
   * Throws if no such session exists.
   */
  chatMessages(id: string): ChatMessage[]

  /** Returns one session by id, including an empty paper-bound session hidden from the sidebar. */
  chatSession(id: string): ChatSession

  /**
   * Creates a session carrying the given title, assigns it an id unused by the
   * vault, puts it before the sessions already there, and returns it. A new
   * session holds no messages and is not archived. A session created unnamed
   * takes its title from the first message you send it.
   */
  createChat(title: string, named: boolean): ChatSession

  /**
   * Returns the one discussion session bound to the given paper, creating it
   * when this is the first time that paper has been opened for discussion.
   * The paper itself supplies the session title. Throws if the paper does not
   * exist.
   */
  chatForPaper(paperId: string): ChatSession

  /**
   * Appends the given messages to the session with the given id, each taking
   * an id unused by that session. An unnamed session takes its title from the
   * first appended message you sent and counts as named from then on. Throws
   * if no such session exists.
   */
  appendChatMessages(id: string, messages: ChatMessageFields[]): void

  /**
   * Returns user-authored research ideas. Ideas reorderIdeas names come first, in its order;
   * every other idea falls back to most recently updated first.
   */
  listIdeas(): ResearchIdea[]

  /**
   * Sets the manual order listIdeas returns ideas in, the same way reorderProjects does for
   * projects.
   */
  reorderIdeas(order: readonly string[]): void

  /**
   * Creates an idea from text the user explicitly wrote in the save dialog. Core resolves and
   * records the source conversation and optional paper instead of treating the last chat message
   * as the idea itself.
   */
  createIdea(chatId: string, title: string, body: string): ResearchIdea

  /** Updates content, attention state, or the optional project link of an existing idea. */
  updateIdea(id: string, patch: ResearchIdeaMutation): ResearchIdea

  /** Moves an idea into the shared trash so it can be restored during the retention window. */
  deleteIdea(id: string): void

  /**
   * Appends the writeBack action on the given message to its project as a
   * CHAT_EVENT_PREFIX event, marks that action done, and returns the project.
   * An action can only be recorded once.
   */
  recordAction(id: string, messageId: string): ProjectDetail

  /**
   * Sets whether the session with the given id is archived. Throws if no such
   * session exists.
   */
  setChatArchived(id: string, archived: boolean): void

  /**
   * Returns the hits whose title contains the given query once trimmed,
   * compared without case, at most SEARCH_LIMIT of them. Aggregations come
   * first, then projects, chats and papers, each group in
   * vault order, so a query matching more than the limit loses the later
   * groups first. A query that is blank once trimmed matches nothing.
   */
  search(query: string): SearchHit[]
}

/**
 * Everything a store implements on its own. The changelog reads and the undo
 * are not among them: withChangelog adds those over any of these, so that one
 * implementation records the writes of every store. Here, restoreTrash only
 * has to put the trash entry back; emptying the cells a paper's columns no
 * longer take, and recording that as a change, is withChangelog's doing, not
 * the bare store's.
 */
export type VaultOps = Omit<
  VaultStore,
  | 'listChanges'
  | 'undoChange'
  | 'archiveChange'
  | 'archiveAllChanges'
  | 'deleteChange'
  | 'clearArchivedChanges'
>
