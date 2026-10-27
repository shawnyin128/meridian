import type { AppUpdateStatus } from '../shared/app-update.js'
import type { AppCommand, MenuState } from '../shared/app-commands.js'
import type {
  AttachmentFields, AuthorCandidate, AuthorSearchFailed, CallRejection, ChangeEntry, ChatCancelResult,
  ChatMessage, ChatMessageFields, ChatModelChoice, ChatRun, ChatSendResult, ChatSession, ChatWriting, ColourTheme,
  ColourThemeFile,
  ConclusionState, ContractMethod, Facet, FieldValue, PluginVersion, SemanticKeyCheckResult, SemanticKeyStatus,
  DeliverySettings, DiscoveryFeedback, DiscoveryFetchResult, DiscoveryIntentAction, DiscoveryProfile,
  ExtensionStatus, FeedEntry, FeedFields,
  InboxDownloadResult, InboxEntry, InboxListParams, JobsStatus, LaterEntry, ListParams,
  HarnessAddModelParams, HarnessApplyPaperWikiResult, HarnessCancelResult, HarnessCli, HarnessModelConnectionCheckResult,
  HarnessFailureDetail, HarnessSourceModels, HarnessUpdateModelParams,
  HarnessModelSettings, HarnessModelSettingsUpdate, HarnessSubscriptionStatus, HarnessUpdateSubscriptionParams,
  HarnessPaperWikiRejectionFeedback, HarnessPendingPaperWikiResult, HarnessPlan,
  HarnessRejectPaperWikiResult, HarnessRunReceipt,
  LibraryBackup, LibraryLocation, LibraryResetResult, ListResult,
  MilestoneFields, NetFailed, PaperColumn, PaperColumns, PaperFields, PaperImportResult, PaperReading, PaperRow, PublicationFillResult,
  Proposal, ProjectDetail, ProjectFields, ProjectRecordedChange, ProjectWorkspaceBinding, ReadingMutation,
  OptionalRecordedChange, ReadingRecordedChange, RecordedChange,
  ResearchIdea,
  ResearchIdeaGraphPlacement, ResearchIdeaPatch, ResearchIdeaPlaceOnGraphResult,
  ResearchIdeaPromoteResult,
  ProjectOverview,
  ProjectSummary,
  RelationFields, SearchHit, SshFolders, SshFoldersParams, TaskFields, TaskPatch, TrashEntry, TrashedEntry, Watch, WatchFields,
  WatchSuggestionParams, WatchSuggestionResult, WikiAggregation,
  WikiAggregationCard, WikiBacklink, WikiHome, WikiPaper, ProposalReceipt, ProposalStatus, WikiProposal, WikiSignal,
} from '../shared/contract.js'
import { CallError } from './call-error.js'

/**
 * The CallError for a rejected `method` call: Core rejects with a CallRejection; any other rejection,
 * such as the preload losing its connection, is logged and becomes `unknown`.
 */
function callError(method: ContractMethod, rejected: unknown): CallError {
  if (typeof rejected === 'object' && rejected !== null && !(rejected instanceof Error) && 'reason' in rejected) {
    return new CallError(method, (rejected as CallRejection).reason)
  }
  console.error(`[ipc] ${method}: ${rejected instanceof Error ? rejected.message : String(rejected)}`)
  return new CallError(method, 'unknown')
}

const call = <T>(method: ContractMethod, params: unknown): Promise<T> =>
  (window.meridian.call(method, params) as Promise<T>).catch((rejected: unknown) => {
    throw callError(method, rejected)
  })

export const appMenu = {
  /**
   * Calls `handler` when the user opens settings from the app menu and returns its unsubscribe
   * function. A menu click is a command, not data: the main process sends it here, not via Core.
   */
  onOpenSettings: (handler: () => void) => window.meridian.onOpenSettings(handler),
  /** Open the Skill and MCP tutorial from the native Help menu. */
  onOpenAgentTutorial: (handler: () => void) => window.meridian.onOpenAgentTutorial(handler),
  /** Open the command palette from the native menu, whose accelerator is the palette's shortcut. */
  onOpenPalette: (handler: () => void) => window.meridian.onOpenPalette(handler),
  /**
   * Calls `handler` with each command Main hands the page, from the application menu or a trackpad
   * swipe, and returns its unsubscribe function.
   */
  onAppCommand: (handler: (command: AppCommand) => void) => window.meridian.onAppCommand(handler),
  /** Tells Main whether the sidebar is hidden and the reader shown, which title and route menu items. */
  setMenuState: (state: MenuState) => { window.meridian.setMenuState(state) },
  /** Open the system directory selector. The page only gets the final path, not any Electron channel. */
  chooseLibraryRoot: () => window.meridian.chooseLibraryRoot(),
  /** Open the system directory selector and connect the code workspace to a project. */
  chooseWorkspaceRoot: () => window.meridian.chooseWorkspaceRoot(),
  /** Restarts the app once the user confirms switching to the new vault, so Core opens it at startup. */
  restartApp: () => { window.meridian.restartApp() },
  /** Opens the folder of the App's log files in the system file manager. */
  revealLogs: () => { window.meridian.revealLogs() },
  /** The self-drawn title bar switches between maximized and restored when double-clicked. */
  toggleMaximize: () => { window.meridian.toggleMaximize() },
  /**
   * Calls `handler` with whether the window is full screen, once now and on every change, and
   * returns its unsubscribe function.
   */
  onFullScreen: (handler: (on: boolean) => void) => window.meridian.onFullScreen(handler),
  /** The platform; it sets the title bar's room for window buttons and whether shortcuts use ⌘ or Ctrl. */
  platform: (): string => window.meridian.platform,
  /**
   * Gives the main process the window buttons' symbol color; call it on every dark/light switch, or
   * the symbols stay the dark theme's gray in the light theme. Does nothing on darwin.
   */
  setTitleBarTheme: (symbolColor: string) => { window.meridian.setTitleBarTheme(symbolColor) },
}

export const library = {
  location: () => call<LibraryLocation>('library.location', {}),
  configure: (root: string) => call<LibraryLocation>('library.configure', { root }),
  reset: () => call<LibraryResetResult>('library.reset', {}),
  backups: () => call<LibraryBackup[]>('library.backups', {}),
  switchBackup: (id: string) => call<LibraryResetResult>('library.switchBackup', { id }),
  deleteBackup: (id: string) => call<null>('library.deleteBackup', { id }),
}

export const extensions = {
  status: () => call<ExtensionStatus[]>('extensions.status', {}),
  /** Reads the newest plugin version from the repository, then returns the statuses measured against it. */
  checkLatest: () => call<ExtensionStatus[]>('extensions.checkLatest', {}),
  /** The newest plugin version known and when it was last read from the repository. */
  pluginVersion: () => call<PluginVersion>('extensions.pluginVersion', {}),
}

/** The app's own self-update, run by the main process rather than Core. */
export const appUpdates = {
  status: () => window.meridian.updates.status(),
  /** Starts a check now and returns the status right after starting it. */
  check: () => window.meridian.updates.check(),
  /** Quits and installs a downloaded update. */
  install: () => { window.meridian.updates.install() },
  /** Calls `handler` with every new status and returns the unsubscribe function. */
  onChange: (handler: (status: AppUpdateStatus) => void) => window.meridian.updates.onChange(handler),
}

export const files = {
  /** The absolute path of the file dragged in or clicked on the local machine; the file that does not come from the disk is an empty string. */
  pathOf: (file: File): string => window.meridian.pathForFile(file),
  /** Locate the file in the system file manager; give false if the file is no longer there. */
  reveal: (path: string): Promise<boolean> => window.meridian.revealFile(path),
}

export const vault = {
  /**
   * Today in the vault, as an ISO date; every relative date on screen and the trash retention count
   * from it. It follows the vault's clock and changes past midnight, so fetch it again, not once.
   */
  today: () => call<string>('vault.today', {}),
}

export const papers = {
  list: (params: ListParams) => call<ListResult>('papers.list', params),
  /** The id of every paper in the vault, read page by page. */
  allIds: async (): Promise<string[]> => {
    const ids: string[] = []
    for (let page = 1; ; page += 1) {
      const { rows, total } = await call<ListResult>('papers.list', { page, size: 200 })
      ids.push(...rows.map((row) => row.id))
      if (rows.length === 0 || ids.length >= total) return ids
    }
  },
  facets: (field: string, filter?: string, filters: readonly FieldValue[] = []) =>
    call<Facet[]>('papers.facets', { field, ...(filter ? { filter } : {}), ...(filters.length > 0 ? { filters } : {}) }),
  get: (id: string) => call<PaperRow>('papers.get', { id }),
  update: (id: string, patch: Partial<PaperFields>) =>
    call<RecordedChange>('papers.update', { id, patch }),
  /** Files the paper under (`member` true) or unfiles it from the Wiki topic page titled `topic`. */
  setTopic: (id: string, topic: string, member: boolean) =>
    call<RecordedChange>('papers.setTopic', { id, topic, member }),
  delete: (id: string) => call<RecordedChange>('papers.delete', { id }),
  /** Bytes of the paper's original PDF. Rejects when the vault has no source file for this paper. */
  source: (id: string) => call<Uint8Array>('papers.source', { id }),
  /** The uploaded binary is directly structurally cloned to Core without base64. */
  import: (filename: string, bytes: Uint8Array) =>
    call<PaperImportResult>('papers.import', { filename, bytes }),
  /** Parses the metadata of an upload whose lookup failed again; progress shows in jobs.status. */
  /** Fills the papers' publication venue and year from Semantic Scholar; how many papers changed. */
  fillPublication: () => call<PublicationFillResult>('papers.fillPublication', {}),
  retryMetadata: (id: string) => call<void>('papers.retryMetadata', { id }),
  reading: (id: string) => call<PaperReading>('papers.reading', { id }),
  mutateReading: (id: string, mutation: ReadingMutation) =>
    call<ReadingRecordedChange>('papers.mutateReading', { id, mutation }),
  columns: () => call<PaperColumns>('papers.columns', {}),
  setColumns: (columns: PaperColumns) => call<OptionalRecordedChange>('papers.setColumns', { columns }),
  renameOption: (key: string, from: string, to: string) =>
    call<RecordedChange>('papers.renameOption', { key, from, to }),
  setColumnType: (key: string, type: PaperColumn['type']) =>
    call<RecordedChange>('papers.setColumnType', { key, type }),
}

export const harness = {
  modelSettings: () => call<HarnessModelSettings>('harness.modelSettings', {}),
  updateModelSettings: (settings: HarnessModelSettingsUpdate) =>
    call<HarnessModelSettings>('harness.updateModelSettings', settings),
  /** Checks configured model `model`, or the default model without one. */
  checkModelConnection: (model?: string) =>
    call<HarnessModelConnectionCheckResult>('harness.checkModelConnection', model === undefined ? {} : { model }),
  /** Adds a configured model; the first one added becomes the default. */
  /** The models configured source `source` offers, as Core read them for the session. */
  sourceModels: (source: string) => call<HarnessSourceModels>('harness.sourceModels', { source }),
  addModel: (params: HarnessAddModelParams) => call<HarnessModelSettings>('harness.addModel', params),
  updateModel: (params: HarnessUpdateModelParams) => call<HarnessModelSettings>('harness.updateModel', params),
  removeModel: (id: string) => call<HarnessModelSettings>('harness.removeModel', { id }),
  setDefaultModel: (id: string) => call<HarnessModelSettings>('harness.setDefaultModel', { id }),
  /** Makes a subscription CLI the model source; the API profiles stay as they are. */
  updateSubscription: (choice: HarnessUpdateSubscriptionParams) =>
    call<HarnessModelSettings>('harness.updateSubscription', choice),
  /** Whether subscription CLI `cli` is installed on this machine, in which version, and how it is signed in. */
  subscriptionStatus: (cli: HarnessCli) => call<HarnessSubscriptionStatus>('harness.subscriptionStatus', { cli }),
  /** Builds a deterministic one-time scope. Runtime budgets remain internal to Core. */
  pendingPaperWiki: (paperId: string) =>
    call<HarnessPendingPaperWikiResult>('harness.pendingPaperWiki', { paperId }),
  preparePaperWiki: (paperId: string) => call<HarnessPlan>(
    'harness.prepare', { workflow: 'paper-wiki', paperId },
  ),
  /** Exchanges one exact, user-confirmed plan for one Harness run. */
  start: (plan: HarnessPlan) => call<HarnessRunReceipt>('harness.start', {
    planId: plan.id,
    scopeDigest: plan.scopeDigest,
    acknowledgeCost: true,
  }),
  /** Stops the Wiki run going for paper `paperId`; an already-issued provider request may still be billable. */
  cancel: (paperId: string) => call<HarnessCancelResult>('harness.cancel', { paperId }),
  /** Forgets why the last Wiki run of paper `paperId` failed. */
  dismissFailure: (paperId: string) => call<null>('harness.dismissFailure', { paperId }),
  applyPaperWiki: (proposalId: string, body: string) =>
    call<HarnessApplyPaperWikiResult>('harness.applyPaperWiki', { proposalId, body }),
  rejectPaperWiki: (proposalId: string, feedback?: HarnessPaperWikiRejectionFeedback) =>
    call<HarnessRejectPaperWikiResult>('harness.rejectPaperWiki', {
      proposalId, ...(feedback === undefined ? {} : { feedback }),
    }),
}

export const project = {
  list: () => call<ProjectSummary[]>('project.list', {}),
  overview: () => call<ProjectOverview[]>('project.overview', {}),
  create: (name: string) => call<string>('project.create', { name }),
  get: (id: string) => call<ProjectDetail>('project.get', { id }),
  bindWorkspace: (id: string, binding: ProjectWorkspaceBinding | null) =>
    call<ProjectDetail>('project.bindWorkspace', { id, binding }),
  update: (id: string, patch: Partial<ProjectFields>) =>
    call<ProjectRecordedChange>('project.update', { id, patch }),
  delete: (id: string) => call<RecordedChange>('project.delete', { id }),
  createTask: (projectId: string, task: TaskFields) =>
    call<ProjectDetail>('project.createTask', { projectId, task }),
  updateTask: (projectId: string, taskId: string, patch: TaskPatch) =>
    call<ProjectDetail>('project.updateTask', { projectId, taskId, patch }),
  deleteTask: (projectId: string, taskId: string) =>
    call<ProjectRecordedChange>('project.deleteTask', { projectId, taskId }),
  reorderTasks: (projectId: string, order: string[]) =>
    call<ProjectDetail>('project.reorderTasks', { projectId, order }),
  setTaskNode: (projectId: string, taskId: string, nodeId: string | null) =>
    call<ProjectDetail>('project.setTaskNode', { projectId, taskId, nodeId }),
  createMilestone: (projectId: string, milestone: MilestoneFields) =>
    call<ProjectDetail>('project.createMilestone', { projectId, milestone }),
  updateMilestone: (projectId: string, milestoneId: string, patch: Partial<MilestoneFields>) =>
    call<ProjectDetail>('project.updateMilestone', { projectId, milestoneId, patch }),
  deleteMilestone: (projectId: string, milestoneId: string) =>
    call<ProjectRecordedChange>('project.deleteMilestone', { projectId, milestoneId }),
  createRelation: (projectId: string, relation: RelationFields) =>
    call<ProjectDetail>('project.createRelation', { projectId, relation }),
  deleteRelation: (projectId: string, relationId: string) =>
    call<ProjectRecordedChange>('project.deleteRelation', { projectId, relationId }),
  updateRelation: (projectId: string, relationId: string, relation: Omit<RelationFields, 'group'>) =>
    call<ProjectDetail>('project.updateRelation', { projectId, relationId, relation }),
  addPaper: (projectId: string, paperId: string) =>
    call<ProjectDetail>('project.addPaper', { projectId, paperId }),
  removePaper: (projectId: string, paperId: string) =>
    call<ProjectRecordedChange>('project.removePaper', { projectId, paperId }),
  moveRelation: (projectId: string, id: string, index: number) =>
    call<ProjectDetail>('project.moveRelation', { projectId, id, index }),
  reorder: (order: string[]) => call<void>('project.reorder', { order }),
  createAttachment: (projectId: string, attachment: AttachmentFields) =>
    call<ProjectDetail>('project.createAttachment', { projectId, attachment }),
  deleteAttachment: (projectId: string, attachmentId: string) =>
    call<ProjectRecordedChange>('project.deleteAttachment', { projectId, attachmentId }),
  createConclusion: (
    projectId: string, text: string, from: { chat?: string; paper?: string } = {},
  ) => call<ProjectDetail>('project.createConclusion', { projectId, text, ...from }),
  setConclusionState: (projectId: string, conclusionId: string, state: ConclusionState) =>
    call<ProjectDetail>('project.setConclusionState', { projectId, conclusionId, state }),
  deleteConclusion: (projectId: string, conclusionId: string) =>
    call<ProjectDetail>('project.deleteConclusion', { projectId, conclusionId }),
  verifyConclusion: (projectId: string, node: string, fingerprint: string) =>
    call<ProjectDetail>('project.verifyConclusion', { projectId, node, fingerprint }),
  unverifyConclusion: (projectId: string, node: string) =>
    call<ProjectDetail>('project.unverifyConclusion', { projectId, node }),
}

export const changelog = {
  list: () => call<ChangeEntry[]>('changelog.list', {}),
  /**
   * Undoes this change: the entity returns to how it was before it. Rejects when it cannot be undone,
   * with the reason in the error: already undone, the snapshot expired, or the entity changed since.
   */
  undo: (id: string) => call<void>('changelog.undo', { id }),
  /** Archives this entry into "Archived", out of the unseen count; archiving it again does nothing. */
  archive: (id: string) => call<void>('changelog.archive', { id }),
  /** Archives every entry not archived yet. */
  archiveAll: () => call<void>('changelog.archiveAll', {}),
  /** Permanently deletes one change record and its undo snapshot; the Wiki's append-only log is left as is. */
  delete: (id: string) => call<void>('changelog.delete', { id }),
  /** All archived records are permanently deleted, and unarchived records remain unchanged. */
  clearArchived: () => call<void>('changelog.clearArchived', {}),
}

export const feed = {
  list: () => call<FeedEntry[]>('feed.list', {}),
  append: (entry: FeedFields) => call<void>('feed.append', entry),
}

export const chat = {
  list: () => call<ChatSession[]>('chat.list', {}),
  messages: (id: string) => call<ChatMessage[]>('chat.messages', { id }),
  create: (title: string, named: boolean) => call<ChatSession>('chat.create', { title, named }),
  forPaper: (paperId: string) => call<ChatSession>('chat.forPaper', { paperId }),
  append: (id: string, messages: ChatMessageFields[]) =>
    call<void>('chat.append', { id, messages }),
  /** Sends what the user wrote in `runs`, each mention as a run of its own. */
  send: (id: string, runs: ChatRun[]) => call<ChatSendResult>('chat.send', { id, runs }),
  /** Asks again for an answer to the chat's last question after its turn ended in a status line. */
  retry: (id: string) => call<ChatSendResult>('chat.retry', { id }),
  cancel: (id: string) => call<ChatCancelResult>('chat.cancel', { id }),
  /** The answer being written in the chat, with the model writing it, or null while no turn runs there. */
  writing: (id: string) => call<ChatWriting | null>('chat.writing', { id }),
  /** Where the chat's last turn failed, or null when Core knows of none. */
  failure: (id: string) => call<HarnessFailureDetail | null>('chat.failure', { id }),
  /** The configured source the chat runs on, and its own model of it and reasoning effort. */
  model: (id: string) => call<ChatModelChoice>('chat.model', { id }),
  /** Makes the chat run on configured source `source`, on its model `model` and at `effort`, each else the source's own. */
  setModel: (id: string, source: string, model?: string, effort?: string) => call<ChatModelChoice>('chat.setModel', {
    id, source, ...(model === undefined ? {} : { model }), ...(effort === undefined ? {} : { effort }),
  }),
  recordAction: (id: string, messageId: string) =>
    call<ProjectDetail>('chat.recordAction', { id, messageId }),
  setArchived: (id: string, archived: boolean) =>
    call<void>('chat.setArchived', { id, archived }),
  /** Gives the chat the title `title`; the chat's first message no longer names it. */
  rename: (id: string, title: string) => call<ChatSession>('chat.rename', { id, title }),
  delete: (id: string) => call<TrashedEntry>('chat.delete', { id }),
}

export const idea = {
  list: () => call<ResearchIdea[]>('idea.list', {}),
  create: (chatId: string | undefined, title: string, body: string, sourceProject?: string) =>
    call<ResearchIdea>('idea.create', {
      ...chatId === undefined ? {} : { chatId }, ...sourceProject === undefined ? {} : { sourceProject }, title, body,
    }),
  update: (id: string, patch: ResearchIdeaPatch) =>
    call<ResearchIdea>('idea.update', { id, patch }),
  promote: (id: string) => call<ResearchIdeaPromoteResult>('idea.promote', { id }),
  placeOnGraph: (id: string, placement: ResearchIdeaGraphPlacement) =>
    call<ResearchIdeaPlaceOnGraphResult>('idea.placeOnGraph', { id, placement }),
  delete: (id: string) => call<TrashedEntry>('idea.delete', { id }),
  reorder: (order: string[]) => call<void>('idea.reorder', { order }),
}

export const inbox = {
  list: (params: InboxListParams = {}) => call<InboxEntry[]>('inbox.list', params),
  dismiss: (id: string) => call<TrashedEntry>('inbox.dismiss', { id }),
  readLater: (id: string) => call<boolean>('inbox.readLater', { id }),
  /** Adds the paper to the vault; whether it was added or already there tells the UI how to open the entry. */
  download: (id: string) => call<InboxDownloadResult>('inbox.download', { id }),
  /** Starts one fetch of the watch `watchId`, or of every active watch, and returns immediately. */
  fetch: (watchId?: string) => call<void>('inbox.fetch', watchId === undefined ? {} : { watchId }),
}

export const discovery = {
  profiles: () => call<DiscoveryProfile[]>('discovery.profiles', {}),
  fetch: (projectId?: string, force = false) => call<DiscoveryFetchResult>(
    'discovery.fetch', {
      ...(projectId === undefined ? {} : { projectId }),
      ...(force ? { force: true } : {}),
    },
  ),
  setIntent: (projectId: string, intentId: string, action: DiscoveryIntentAction) =>
    call<void>('discovery.intent', { projectId, intentId, action }),
  /** Records the feedback; `less` and `known` move the entry to the trash and answer that trash entry. */
  feedback: (id: string, feedback: DiscoveryFeedback) =>
    call<TrashedEntry | null>('discovery.feedback', { id, feedback }),
}

export const delivery = {
  settings: () => call<DeliverySettings>('delivery.settings', {}),
  updateSettings: (settings: DeliverySettings) => call<void>('delivery.updateSettings', settings),
  semanticKey: () => call<SemanticKeyStatus>('delivery.semanticKey', {}),
  /** Saves the optional Semantic Scholar API key, or removes it when null. */
  setSemanticKey: (apiKey: string | null) => call<SemanticKeyStatus>('delivery.setSemanticKey', { apiKey }),
  /** Makes one Semantic Scholar request with the saved key and reports how it went. */
  checkSemanticKey: () => call<SemanticKeyCheckResult>('delivery.checkSemanticKey', {}),
}

export const ssh = {
  /** The `Host` aliases of the user's OpenSSH config, in its order. */
  hosts: () => call<string[]>('ssh.hosts', {}),
  /** One folder of an SSH host, the remote home without `path`, or why it could not be listed. */
  folders: (params: SshFoldersParams) => call<SshFolders>('ssh.folders', params),
}

export const colourThemes = {
  /** Every file in the config home's themes folder: its theme, or why it cannot be used. */
  list: () => call<ColourThemeFile[]>('themes.list', {}),
  /** Writes one custom theme to its file, replacing the file of the same id. */
  save: (theme: ColourTheme) => call<void>('themes.save', { theme }),
  /** Deletes the file of one custom theme; it cannot be undone. */
  delete: (id: string) => call<void>('themes.delete', { id }),
}

export const later = {
  list: () => call<LaterEntry[]>('later.list', {}),
  remove: (id: string) => call<TrashedEntry>('later.remove', { id }),
}

export const watch = {
  list: () => call<Watch[]>('watch.list', {}),
  suggest: (input: WatchSuggestionParams) => call<WatchSuggestionResult | NetFailed>('watch.suggest', input),
  create: (fields: WatchFields) => call<void>('watch.create', { watch: fields }),
  update: (id: string, fields: WatchFields) => call<void>('watch.update', { id, watch: fields }),
  setActive: (id: string, active: boolean) => call<void>('watch.setActive', { id, active }),
  delete: (id: string) => call<void>('watch.delete', { id }),
}

export const author = {
  search: (query: string) => call<AuthorCandidate[] | AuthorSearchFailed>('author.search', { query }),
}

export const wiki = {
  home: () => call<WikiHome>('wiki.home', {}),
  aggregation: (id: string) => call<WikiAggregation>('wiki.aggregation', { id }),
  paper: (id: string) => call<WikiPaper>('wiki.paper', { id }),
  cards: () => call<WikiAggregationCard[]>('wiki.cards', {}),
  apply: (proposal: Proposal) => call<RecordedChange>('wiki.apply', { proposal }),
  update: (id: string, body: string) => call<void>('wiki.update', { id, body }),
  /** Moves aggregation page `id` into the trash. */
  delete: (id: string) => call<RecordedChange>('wiki.delete', { id }),
  /** Merges aggregation `from` into `into`; `shown` holds the two pages' cards as the screen showed them. */
  merge: (from: string, into: string, shown: { from: WikiAggregationCard; into: WikiAggregationCard }) =>
    call<RecordedChange>('wiki.merge', { from, into, shown }),
  /** The review queue, newest first; every status when `status` is absent. */
  proposals: (status?: ProposalStatus) =>
    call<WikiProposal[]>('wiki.proposals', status === undefined ? {} : { status }),
  decide: (id: string, decision: 'apply' | 'decline', reason?: string) =>
    call<ProposalReceipt>('wiki.decide', { id, decision, ...(reason === undefined ? {} : { reason }) }),
  /** The signals of what in the Wiki needs tidying, as the vault stands. */
  signals: () => call<WikiSignal[]>('wiki.signals', {}),
  /** What refers to page `id`: other pages, projects, ideas and chats. */
  backlinks: (id: string) => call<WikiBacklink[]>('wiki.backlinks', { id }),
}

export const search = {
  /** The items the global search query hits; Core decides how many and in what order. */
  query: (query: string) => call<SearchHit[]>('search.query', { query }),
}

export const jobs = {
  /** What Core does at the moment outside of a single call. */
  status: () => call<JobsStatus>('jobs.status', {}),
}

export const trash = {
  list: () => call<TrashEntry[]>('trash.list', {}),
  restore: (id: string) => call<void>('trash.restore', { id }),
  purge: (id: string) => call<void>('trash.purge', { id }),
  clear: () => call<void>('trash.clear', {}),
}
