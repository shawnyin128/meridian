import type { AppUpdateStatus } from '../shared/app-update.js'
import type {
  AttachmentFields, AuthorCandidate, ChangeEntry, ChatCancelResult, ChatMessage, ChatMessageFields,
  ChatSendResult, ChatSession, ConclusionState,
  ContractMethod, Facet, PluginVersion, SemanticKeyCheckResult, SemanticKeyStatus,
  DeliverySettings, DiscoveryFeedback, DiscoveryFetchResult, DiscoveryIntentAction, DiscoveryProfile,
  ExtensionStatus, FeedEntry, FeedFields,
  InboxDownloadResult, InboxEntry, InboxListParams, JobsStatus, LaterEntry, ListParams,
  HarnessApplyPaperWikiResult, HarnessCancelResult, HarnessModelConnectionCheckResult,
  HarnessModelSettings, HarnessModelSettingsUpdate,
  HarnessPaperWikiRejectionFeedback, HarnessPendingPaperWikiResult, HarnessPlan,
  HarnessRejectPaperWikiResult, HarnessRunReceipt,
  LibraryBackup, LibraryLocation, LibraryResetResult, ListResult,
  MilestoneFields, PaperColumn, PaperColumns, PaperFields, PaperImportResult, PaperReading, PaperRow,
  Proposal, ProjectDetail, ProjectFields, ProjectWorkspaceBinding, ReadingMutation, ResearchIdea,
  ResearchIdeaGraphPlacement, ResearchIdeaPatch, ResearchIdeaPlaceOnGraphResult,
  ResearchIdeaPromoteResult,
  ProjectOverview,
  ProjectSummary,
  RelationFields, SearchHit, TaskFields, TaskPatch, TrashEntry, Watch, WatchFields,
  WatchSuggestionParams, WatchSuggestionResult, WikiAggregation,
  WikiAggregationCard, WikiHome, WikiPaper, ProposalReceipt, ProposalStatus, WikiProposal,
} from '../shared/contract.js'

const call = <T>(method: ContractMethod, params: unknown): Promise<T> =>
  window.meridian.call(method, params) as Promise<T>

export const appMenu = {
  /**
   * When the user requests to open settings in the application menu, call `handler` and return the function to unsubscribe from it. Menu click is a command, not
   * The number is fetched and sent directly to this page by the main process without going through the core.
   */
  onOpenSettings: (handler: () => void) => window.meridian.onOpenSettings(handler),
  /** Open the Skill and MCP tutorial from the native Help menu. */
  onOpenAgentTutorial: (handler: () => void) => window.meridian.onOpenAgentTutorial(handler),
  /** Open the system directory selector. The page only gets the final path, not any Electron channel. */
  chooseLibraryRoot: () => window.meridian.chooseLibraryRoot(),
  /** Open the system directory selector and connect the code workspace to a project. */
  chooseWorkspaceRoot: () => window.meridian.chooseWorkspaceRoot(),
  /** After the user confirms the adoption of the new library, the application is restarted, allowing Core to open a new workspace at the startup boundary. */
  restartApp: () => { window.meridian.restartApp() },
  /** The self-drawn title bar switches between maximized and restored when double-clicked. */
  toggleMaximize: () => { window.meridian.toggleMaximize() },
  /** Which platform to run on. It depends on how much space should be left on both sides of the title bar for the window buttons and whether the shortcut key should be ⌘ or Ctrl. */
  platform: (): string => window.meridian.platform,
  /**
   * Give the color of the three symbols of the window button to the main process. You will get it once every time you change the dark or light theme, otherwise if you change the dark theme
   * Those three symbols are still gray in the light theme. This call on darwin does nothing.
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
   * Curry's today, ISO date. The retention period of each relative date on the screen and the trash can is calculated from it. It follows the library clock,
   * It will change after midnight in a session, so you need to retrieve it again, you can't just retrieve it once and keep it for later use.
   */
  today: () => call<string>('vault.today', {}),
}

export const papers = {
  list: (params: ListParams) => call<ListResult>('papers.list', params),
  facets: (field: string, filter?: string) =>
    call<Facet[]>('papers.facets', { field, ...(filter ? { filter } : {}) }),
  get: (id: string) => call<PaperRow>('papers.get', { id }),
  update: (id: string, patch: Partial<PaperFields>) =>
    call<void>('papers.update', { id, patch }),
  delete: (id: string) => call<void>('papers.delete', { id }),
  /** Bytes of the original PDF of the paper. Reject if the original text of this article is not available in the library. */
  source: (id: string) => call<Uint8Array>('papers.source', { id }),
  /** The uploaded binary is directly structurally cloned to Core without base64. */
  import: (filename: string, bytes: Uint8Array) =>
    call<PaperImportResult>('papers.import', { filename, bytes }),
  reading: (id: string) => call<PaperReading>('papers.reading', { id }),
  mutateReading: (id: string, mutation: ReadingMutation) =>
    call<PaperReading>('papers.mutateReading', { id, mutation }),
  columns: () => call<PaperColumns>('papers.columns', {}),
  setColumns: (columns: PaperColumns) => call<void>('papers.setColumns', { columns }),
  renameOption: (key: string, from: string, to: string) =>
    call<void>('papers.renameOption', { key, from, to }),
  setColumnType: (key: string, type: PaperColumn['type']) =>
    call<void>('papers.setColumnType', { key, type }),
}

export const harness = {
  modelSettings: () => call<HarnessModelSettings>('harness.modelSettings', {}),
  updateModelSettings: (settings: HarnessModelSettingsUpdate) =>
    call<HarnessModelSettings>('harness.updateModelSettings', settings),
  checkModelConnection: () =>
    call<HarnessModelConnectionCheckResult>('harness.checkModelConnection', {}),
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
  /** Stops accepting a running result; an already-issued provider request may still be billable. */
  cancel: (planId: string) => call<HarnessCancelResult>('harness.cancel', { planId }),
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
  create: (name: string) => call<void>('project.create', { name }),
  get: (id: string) => call<ProjectDetail>('project.get', { id }),
  bindWorkspace: (id: string, binding: ProjectWorkspaceBinding | null) =>
    call<ProjectDetail>('project.bindWorkspace', { id, binding }),
  update: (id: string, patch: Partial<ProjectFields>) =>
    call<ProjectDetail>('project.update', { id, patch }),
  delete: (id: string) => call<void>('project.delete', { id }),
  createTask: (projectId: string, task: TaskFields) =>
    call<ProjectDetail>('project.createTask', { projectId, task }),
  updateTask: (projectId: string, taskId: string, patch: TaskPatch) =>
    call<ProjectDetail>('project.updateTask', { projectId, taskId, patch }),
  deleteTask: (projectId: string, taskId: string) =>
    call<ProjectDetail>('project.deleteTask', { projectId, taskId }),
  reorderTasks: (projectId: string, order: string[]) =>
    call<ProjectDetail>('project.reorderTasks', { projectId, order }),
  createMilestone: (projectId: string, milestone: MilestoneFields) =>
    call<ProjectDetail>('project.createMilestone', { projectId, milestone }),
  updateMilestone: (projectId: string, milestoneId: string, patch: Partial<MilestoneFields>) =>
    call<ProjectDetail>('project.updateMilestone', { projectId, milestoneId, patch }),
  deleteMilestone: (projectId: string, milestoneId: string) =>
    call<ProjectDetail>('project.deleteMilestone', { projectId, milestoneId }),
  createRelation: (projectId: string, relation: RelationFields) =>
    call<ProjectDetail>('project.createRelation', { projectId, relation }),
  deleteRelation: (projectId: string, relationId: string) =>
    call<ProjectDetail>('project.deleteRelation', { projectId, relationId }),
  addPaper: (projectId: string, paperId: string) =>
    call<ProjectDetail>('project.addPaper', { projectId, paperId }),
  removePaper: (projectId: string, paperId: string) =>
    call<ProjectDetail>('project.removePaper', { projectId, paperId }),
  moveRelation: (projectId: string, id: string, index: number) =>
    call<ProjectDetail>('project.moveRelation', { projectId, id, index }),
  reorder: (order: string[]) => call<void>('project.reorder', { order }),
  createAttachment: (projectId: string, attachment: AttachmentFields) =>
    call<ProjectDetail>('project.createAttachment', { projectId, attachment }),
  deleteAttachment: (projectId: string, attachmentId: string) =>
    call<ProjectDetail>('project.deleteAttachment', { projectId, attachmentId }),
  createConclusion: (
    projectId: string, text: string, from: { chat?: string; paper?: string } = {},
  ) => call<ProjectDetail>('project.createConclusion', { projectId, text, ...from }),
  setConclusionState: (projectId: string, conclusionId: string, state: ConclusionState) =>
    call<ProjectDetail>('project.setConclusionState', { projectId, conclusionId, state }),
  deleteConclusion: (projectId: string, conclusionId: string) =>
    call<ProjectDetail>('project.deleteConclusion', { projectId, conclusionId }),
}

export const changelog = {
  list: () => call<ChangeEntry[]>('changelog.list', {}),
  /**
   * Undo this: The entity returns to the way it was before this change. Reject when it cannot be removed, the reason is in the error
   * ——It has been withdrawn, the snapshot has expired, or the entity has been modified after this transaction.
   */
  undo: (id: string) => call<void>('changelog.undo', { id }),
  /** Archive this item: it falls into the "Archived" section and is no longer counted in the unviewed count. Archived and re-archived does nothing. */
  archive: (id: string) => call<void>('changelog.archive', { id }),
  /** Delete everything that has not been archived yet. */
  archiveAll: () => call<void>('changelog.archiveAll', {}),
  /** Permanently delete an interface change record and its undo snapshot, leaving the Wiki's appended audit log unchanged. */
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
  send: (id: string, text: string) => call<ChatSendResult>('chat.send', { id, text }),
  cancel: (id: string) => call<ChatCancelResult>('chat.cancel', { id }),
  recordAction: (id: string, messageId: string) =>
    call<ProjectDetail>('chat.recordAction', { id, messageId }),
  setArchived: (id: string, archived: boolean) =>
    call<void>('chat.setArchived', { id, archived }),
}

export const idea = {
  list: () => call<ResearchIdea[]>('idea.list', {}),
  create: (chatId: string, title: string, body: string) =>
    call<ResearchIdea>('idea.create', { chatId, title, body }),
  update: (id: string, patch: ResearchIdeaPatch) =>
    call<ResearchIdea>('idea.update', { id, patch }),
  promote: (id: string) => call<ResearchIdeaPromoteResult>('idea.promote', { id }),
  placeOnGraph: (id: string, placement: ResearchIdeaGraphPlacement) =>
    call<ResearchIdeaPlaceOnGraphResult>('idea.placeOnGraph', { id, placement }),
  delete: (id: string) => call<void>('idea.delete', { id }),
  reorder: (order: string[]) => call<void>('idea.reorder', { order }),
}

export const inbox = {
  list: (params: InboxListParams = {}) => call<InboxEntry[]>('inbox.list', params),
  dismiss: (id: string) => call<void>('inbox.dismiss', { id }),
  readLater: (id: string) => call<boolean>('inbox.readLater', { id }),
  /** Store this one. The interface will decide whether to open the entry based on whether it has been added to the library or whether the article already exists in the library. */
  download: (id: string) => call<InboxDownloadResult>('inbox.download', { id }),
  /** Starts one full fetch of every active watch and returns immediately. */
  fetch: () => call<void>('inbox.fetch', {}),
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
  feedback: (id: string, feedback: DiscoveryFeedback) =>
    call<void>('discovery.feedback', { id, feedback }),
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

export const later = {
  list: () => call<LaterEntry[]>('later.list', {}),
  remove: (id: string) => call<void>('later.remove', { id }),
}

export const watch = {
  list: () => call<Watch[]>('watch.list', {}),
  suggest: (input: WatchSuggestionParams) => call<WatchSuggestionResult>('watch.suggest', input),
  create: (fields: WatchFields) => call<void>('watch.create', { watch: fields }),
  update: (id: string, fields: WatchFields) => call<void>('watch.update', { id, watch: fields }),
  setActive: (id: string, active: boolean) => call<void>('watch.setActive', { id, active }),
  delete: (id: string) => call<void>('watch.delete', { id }),
}

export const author = {
  search: (query: string) => call<AuthorCandidate[]>('author.search', { query }),
}

export const wiki = {
  home: () => call<WikiHome>('wiki.home', {}),
  aggregation: (id: string) => call<WikiAggregation>('wiki.aggregation', { id }),
  paper: (id: string) => call<WikiPaper>('wiki.paper', { id }),
  cards: () => call<WikiAggregationCard[]>('wiki.cards', {}),
  apply: (proposal: Proposal) => call<void>('wiki.apply', { proposal }),
  update: (id: string, body: string) => call<void>('wiki.update', { id, body }),
  /** The review queue, newest first; every status when `status` is absent. */
  proposals: (status?: ProposalStatus) =>
    call<WikiProposal[]>('wiki.proposals', status === undefined ? {} : { status }),
  decide: (id: string, decision: 'apply' | 'decline', reason?: string) =>
    call<ProposalReceipt>('wiki.decide', { id, decision, ...(reason === undefined ? {} : { reason }) }),
}

export const search = {
  /** For those items hit by the global search word, the upper limit of the number and sorting are determined by core. */
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
