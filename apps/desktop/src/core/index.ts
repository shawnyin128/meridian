import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ContractMethod, LibrarySource } from '../shared/contract.js'
import {
  AuthorSearchParamsSchema,
  ChatAppendParamsSchema,
  ChatCancelParamsSchema,
  ChatCreateParamsSchema,
  ChatForPaperParamsSchema,
  ChatMessagesParamsSchema,
  ChatSendParamsSchema,
  ChatRecordActionParamsSchema,
  ChangelogArchiveParamsSchema,
  ChangelogDeleteParamsSchema,
  ChangelogUndoParamsSchema,
  ChatSetArchivedParamsSchema,
  CONTRACT_METHODS,
  EmptyParamsSchema,
  SemanticKeySetParamsSchema,
  FeedAppendParamsSchema,
  HarnessCancelParamsSchema,
  HarnessPendingPaperWikiParamsSchema,
  HarnessPrepareParamsSchema,
  HarnessApplyPaperWikiParamsSchema,
  HarnessRejectPaperWikiParamsSchema,
  HarnessModelSettingsUpdateSchema,
  HarnessStartParamsSchema,
  DiscoveryFeedbackParamsSchema,
  DiscoveryFetchParamsSchema,
  DiscoveryIntentUpdateParamsSchema,
  DeliverySettingsSchema,
  InboxDismissParamsSchema,
  InboxDownloadParamsSchema,
  InboxListParamsSchema,
  InboxReadLaterParamsSchema,
  LibraryBackupParamsSchema,
  LibraryConfigureParamsSchema,
  LaterRemoveParamsSchema,
  ListParamsSchema,
  PapersDeleteParamsSchema,
  PapersFacetsParamsSchema,
  PapersGetParamsSchema,
  PapersImportParamsSchema,
  PapersMutateReadingParamsSchema,
  PapersReadingParamsSchema,
  PapersRenameOptionParamsSchema,
  PapersSetColumnTypeParamsSchema,
  PapersSetColumnsParamsSchema,
  PapersSourceParamsSchema,
  PapersUpdateParamsSchema,
  ProjectCreateAttachmentParamsSchema,
  ProjectCreateConclusionParamsSchema,
  ProjectCreateMilestoneParamsSchema,
  ProjectCreateParamsSchema,
  ProjectCreateRelationParamsSchema,
  ProjectCreateTaskParamsSchema,
  ProjectBindWorkspaceParamsSchema,
  ProjectDeleteAttachmentParamsSchema,
  ProjectDeleteConclusionParamsSchema,
  ProjectDeleteMilestoneParamsSchema,
  ProjectDeleteParamsSchema,
  ProjectDeleteRelationParamsSchema,
  ProjectDeleteTaskParamsSchema,
  ProjectGetParamsSchema,
  ProjectMoveRelationParamsSchema,
  ProjectPaperParamsSchema,
  ProjectReorderParamsSchema,
  ProjectReorderTasksParamsSchema,
  ProjectSetConclusionStateParamsSchema,
  ResearchIdeaCreateParamsSchema,
  ResearchIdeaDeleteParamsSchema,
  ResearchIdeaPlaceOnGraphParamsSchema,
  ResearchIdeaPromoteParamsSchema,
  ResearchIdeaReorderParamsSchema,
  ResearchIdeaUpdateParamsSchema,
  ProjectUpdateMilestoneParamsSchema,
  ProjectUpdateParamsSchema,
  ProjectUpdateTaskParamsSchema,
  SearchParamsSchema,
  TrashPurgeParamsSchema,
  TrashRestoreParamsSchema,
  WatchCreateParamsSchema,
  WatchDeleteParamsSchema,
  WatchSetActiveParamsSchema,
  WatchSuggestionParamsSchema,
  WatchUpdateParamsSchema,
  WikiAggregationParamsSchema,
  WikiApplyParamsSchema,
  WikiPaperParamsSchema,
  WikiUpdateParamsSchema,
} from '../shared/contract.js'
import { createFixtureStore } from './fixture-store.js'
import { withUiSampleUpload } from './fixtures/ui-samples.js'
import { createBackground } from './background.js'
import cannedNet from './fixtures/net.json' with { type: 'json' }
import { configureLibrary, currentLibrary } from './library-config.js'
import { probePdf } from './paper-library/index.js'
import { ARXIV_INTERVAL_MS } from './net/arxiv.js'
import { createCannedGet, type CannedTable } from './net/canned-http.js'
import { electronGet } from './net/electron-http.js'
import { sleep } from './net/http.js'
import { unopenedStore } from './unopened-store.js'
import type { VaultStore } from './vault.js'
import { createDesktopVaultStore, createVaultStore } from './vault-store.js'
import {
  deleteLibraryBackup, listLibraryBackups, resetLibrary, switchLibraryBackup,
} from './workspace-layout.js'
import { extensionStatuses } from './extensions/status.js'
import { noteVersionChanges } from './extensions/notices.js'
import { createPluginVersionCheck } from './extensions/latest.js'
import { openSemanticKeyStore } from './net/semantic-key.js'
import {
  createChatHarnessRunner, createChatService, createHarnessCostGate,
  createHarnessModelConfig, createHarnessProposalAudit,
  createMainCredentialVault, createPaperWikiHarnessRunner,
} from './harness/index.js'
import { placeResearchIdeaOnGraph } from './research-ideas/graph-placement.js'

type Handler = (params: unknown) => unknown

const handlers = new Map<ContractMethod, Handler>()
let markHandlersReady: () => void = () => {}
const handlersReady = new Promise<void>((resolve) => { markHandlersReady = resolve })

/** Register a contract method implementation; the last registration wins. */
export function registerHandler(method: ContractMethod, fn: Handler): void {
  handlers.set(method, fn)
}

/** Accept every port delivered by Main while holding calls until the complete contract registry is
 * ready. Each renderer reload creates a new channel, so ports may arrive repeatedly. */
process.parentPort.on('message', (event) => {
  if ((event.data as { type?: unknown } | undefined)?.type !== 'port') return
  const port = event.ports[0]
  if (!port) throw new Error('core 未收到 MessagePort')
  port.on('message', (msg) => {
    const { id, method, params } = msg.data as { id: number; method: ContractMethod; params: unknown }
    void handlersReady.then(() => {
      const handler = handlers.get(method)
      if (!handler) throw new Error(`未注册的契约方法:${method}`)
      return handler(params)
    }).then(
      (data) => { port.postMessage({ id, ok: true, data }) },
      (err: unknown) => { port.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) }) },
    )
  })
  port.start()
})

/**
 * When given a real vault, the whole app reads and writes it; without one, the app runs on fixtures.
 * If the real vault cannot open, use a store whose methods report the cause while the two library-
 * location methods remain available so the UI can explain the problem and let the user switch.
 */
const vaultRoot = process.env['MERIDIAN_VAULT_ROOT']
const librarySource = sourceOf(vaultRoot, process.env['MERIDIAN_VAULT_SOURCE'])
const locationRoot = vaultRoot ?? process.env['MERIDIAN_LIBRARY_ROOT'] ?? process.cwd()
const configHome = process.env['MERIDIAN_CONFIG_HOME'] ?? join(homedir(), '.meridian')
const harnessModel = await createHarnessModelConfig(configHome, createMainCredentialVault())
const semanticKey = await openSemanticKeyStore({
  file: join(configHome, 'semantic-scholar.json'), vault: createMainCredentialVault(),
})
const proposalAudit = vaultRoot === undefined ? null : createHarnessProposalAudit(locationRoot)
/** Trust-migration input for openStore: the composition root is the only place allowed to reach into Harness. */
const appliedProposalBodies = (() => {
  if (proposalAudit === null) return new Map<string, string>()
  try {
    return proposalAudit.appliedBodies()
  } catch (error) {
    console.error(`[harness] 已落地提案读取失败：${error instanceof Error ? error.message : String(error)}`)
    return new Map<string, string>()
  }
})()
const { store, openError } = openStore(vaultRoot, appliedProposalBodies)
const appVersion = process.env['MERIDIAN_APP_VERSION']
let libraryLocation = currentLibrary({ currentRoot: locationRoot, source: librarySource, configHome })
/** Fixture mode and explicit canned mode never access the network. */
const canned = vaultRoot === undefined || process.env['MERIDIAN_CANNED_NET'] === '1'
const httpGet = canned ? createCannedGet(cannedNet as CannedTable, locationRoot) : electronGet
// A real library hears about app and plugin version changes once per machine; the fixture library
// never does. A library that failed to open has no feed to post to, and every method of `store`
// throws in that case, so posting here would crash Core before it registers any contract handler.
const noteVersions = (pluginVersion: string): void => {
  if (vaultRoot === undefined || appVersion === undefined || openError !== null) return
  noteVersionChanges({
    file: join(configHome, 'version-notices.json'),
    appVersion,
    pluginVersion,
    extensions: extensionStatuses(undefined, pluginVersion),
    post: (runs) => store.appendFeed({ source: 'steward', body: { kind: 'runs', runs } }),
  })
}
const pluginCheck = createPluginVersionCheck({
  get: httpGet, file: join(configHome, 'plugin-latest.json'), now: Date.now, onLatest: noteVersions,
})
noteVersions(pluginCheck.latest())
if (vaultRoot !== undefined) pluginCheck.arm()
const background = createBackground({
  store,
  get: httpGet,
  probe: probePdf,
  arxivIntervalMs: canned ? 0 : ARXIV_INTERVAL_MS,
  sleep: canned ? async () => {} : sleep,
  now: Date.now,
  semanticScholarApiKey: semanticKey.current,
})
const paperWikiHarness = vaultRoot === undefined ? null : createPaperWikiHarnessRunner({
  store,
  model: harnessModel,
  onLog: (line) => console.error(`[harness] ${line}`),
})
// Chat is always an explicit user action, so a configured model also works with the
// in-memory fixture library used for product review. It never creates background cost.
const chatHarness = createChatHarnessRunner({
  store,
  model: harnessModel,
  onLog: (line) => console.error(`[harness] ${line}`),
})
const chatService = createChatService({ store, model: harnessModel, runner: chatHarness })
const pendingHarnessProposals = (() => {
  if (proposalAudit === null) return []
  try {
    return proposalAudit.pending()
  } catch (error) {
    console.error(`[harness] 待审核提案无法恢复：${error instanceof Error ? error.message : String(error)}`)
    return []
  }
})()
process.once('exit', () => {
  paperWikiHarness?.close()
  chatHarness.close()
})
const harness = createHarnessCostGate({
  paper: (id) => store.getPaper(id),
  reading: (id) => store.paperReading(id),
  wiki: (id) => store.wikiPaper(id),
  model: vaultRoot === undefined
    ? { provider: 'Meridian Demo', name: '本地演示模型', configured: true, billable: false }
    : () => harnessModel.planModel(),
  run: paperWikiHarness === null
    ? async () => ({
      state: 'demo-complete',
      message: '授权门验证完成：演示模式没有调用模型，也没有修改 Wiki。',
    })
    : paperWikiHarness.run,
  applyWiki: (id, body) => store.applyPaperWikiDraft(id, body),
  initialProposals: pendingHarnessProposals,
  ...(proposalAudit === null ? {} : { recordProposal: proposalAudit.record }),
})
/** Automatic fetches run only for a real library using the real network. */
const scheduled = !canned
const showUiSamples = vaultRoot === undefined && process.env['MERIDIAN_UI_SAMPLES'] === '1'
let disarmSchedule = scheduled ? background.armSchedule() : () => {}

/** Main supplies only these sources; treat unknown values as the strict explicit-environment case. */
function sourceOf(root: string | undefined, source: string | undefined): LibrarySource {
  if (root === undefined) return 'fixture'
  return source === 'configured' || source === 'fallback' ? source : 'environment'
}

/**
 * Store for this run: fixtures when no vault is selected; an `unopenedStore` reporting the cause
 * when the selected vault cannot open. `openError` is that same cause, so callers can tell the
 * difference between an unopened store and a real one without invoking a method to find out.
 */
function openStore(
  root: string | undefined, appliedProposalBodies: Map<string, string>,
): { store: VaultStore; openError: string | null } {
  if (root === undefined) {
    return { store: createFixtureStore(undefined, undefined, appliedProposalBodies), openError: null }
  }
  try {
    const store = process.env['MERIDIAN_BOOTSTRAP_VAULT'] === '1'
      ? createDesktopVaultStore(root, undefined, undefined, appliedProposalBodies)
      : createVaultStore(root, undefined, undefined, appliedProposalBodies)
    return { store, openError: null }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[core] 论文库打不开:${reason}`)
    return { store: unopenedStore(reason), openError: reason }
  }
}

type WithoutUndefined<T> = { [K in keyof T]: Exclude<T[K], undefined> }

/**
 * Drops patch keys whose value is undefined. Zod's `.partial()` schema
 * accepts a key explicitly set to undefined as well as a missing key; the
 * store's merge must not see the former, since it would overwrite a
 * required field with undefined.
 */
function definedFields<T extends object>(patch: T): Partial<WithoutUndefined<T>> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<WithoutUndefined<T>>
}

registerHandler('library.location', (params) => {
  EmptyParamsSchema.parse(params)
  return { ...libraryLocation, openError }
})
registerHandler('library.configure', (params) => {
  const { root } = LibraryConfigureParamsSchema.parse(params)
  libraryLocation = configureLibrary(root, {
    currentRoot: locationRoot,
    source: librarySource,
    configHome,
  })
  return libraryLocation
})

registerHandler('library.reset', (params) => {
  EmptyParamsSchema.parse(params)
  assertLibraryRestartReady()
  disarmSchedule()
  try {
    return resetLibrary(locationRoot)
  } catch (error) {
    if (scheduled) disarmSchedule = background.armSchedule()
    throw error
  }
})

registerHandler('library.backups', (params) => {
  EmptyParamsSchema.parse(params)
  return librarySource === 'fixture' ? [] : listLibraryBackups(locationRoot)
})

registerHandler('library.switchBackup', (params) => {
  const { id } = LibraryBackupParamsSchema.parse(params)
  assertLibraryRestartReady()
  disarmSchedule()
  try {
    return switchLibraryBackup(locationRoot, id)
  } catch (error) {
    if (scheduled) disarmSchedule = background.armSchedule()
    throw error
  }
})

registerHandler('library.deleteBackup', (params) => {
  const { id } = LibraryBackupParamsSchema.parse(params)
  if (librarySource === 'fixture') throw new Error('测试数据模式没有论文库备份')
  if (libraryLocation.restartRequired) throw new Error('论文库位置待重启生效，请先重启再管理备份')
  deleteLibraryBackup(locationRoot, id)
  return null
})

function assertLibraryRestartReady(): void {
  if (librarySource === 'fixture') throw new Error('测试数据模式不能切换或重置论文库')
  if (libraryLocation.restartRequired) throw new Error('论文库位置待重启生效，请先重启再继续')
  const status = background.status()
  const parsing = status.uploads.some((job) => job.step !== 'done' && job.step !== 'failed')
  if (parsing || status.downloads.length > 0 || status.fetch.state === 'checking') {
    throw new Error('论文库仍有下载或解析任务，请完成后再继续')
  }
}

registerHandler('extensions.status', (params) => {
  EmptyParamsSchema.parse(params)
  return extensionStatuses(undefined, pluginCheck.latest())
})

registerHandler('delivery.semanticKey', (params) => {
  EmptyParamsSchema.parse(params)
  return semanticKey.status()
})

registerHandler('delivery.setSemanticKey', async (params) => {
  await semanticKey.set(SemanticKeySetParamsSchema.parse(params).apiKey)
  return semanticKey.status()
})

registerHandler('delivery.checkSemanticKey', (params) => {
  EmptyParamsSchema.parse(params)
  return background.checkSemanticKey()
})

registerHandler('extensions.pluginVersion', (params) => {
  EmptyParamsSchema.parse(params)
  return { version: pluginCheck.latest(), checkedAt: pluginCheck.checkedAt() }
})

registerHandler('extensions.checkLatest', async (params) => {
  EmptyParamsSchema.parse(params)
  return extensionStatuses(undefined, await pluginCheck.check())
})

registerHandler('vault.today', (params) => {
  EmptyParamsSchema.parse(params)
  return store.today()
})
registerHandler('papers.list', (params) => store.listPapers(ListParamsSchema.parse(params)))
registerHandler('papers.facets', (params) => {
  const { field, filter } = PapersFacetsParamsSchema.parse(params)
  return store.facetPapers(field, filter)
})
registerHandler('papers.get', (params) => store.getPaper(PapersGetParamsSchema.parse(params).id))
registerHandler('papers.update', (params) => {
  const { id, patch } = PapersUpdateParamsSchema.parse(params)
  return store.updatePaper(id, definedFields(patch))
})
registerHandler('papers.delete', (params) => store.deletePaper(PapersDeleteParamsSchema.parse(params).id))
registerHandler('papers.source', (params) =>
  store.paperSource(PapersSourceParamsSchema.parse(params).id))
registerHandler('papers.import', (params) => {
  const { filename, bytes } = PapersImportParamsSchema.parse(params)
  return background.importPaper(filename, bytes)
})
registerHandler('papers.reading', (params) =>
  store.paperReading(PapersReadingParamsSchema.parse(params).id))
registerHandler('papers.mutateReading', (params) => {
  const { id, mutation } = PapersMutateReadingParamsSchema.parse(params)
  return store.mutatePaperReading(id, mutation)
})
registerHandler('harness.prepare', (params) => {
  const { paperId } = HarnessPrepareParamsSchema.parse(params)
  return harness.prepare(paperId)
})
registerHandler('harness.pendingPaperWiki', (params) =>
  harness.pendingPaperWiki(HarnessPendingPaperWikiParamsSchema.parse(params).paperId))
registerHandler('harness.start', (params) =>
  harness.start(HarnessStartParamsSchema.parse(params)))
registerHandler('harness.cancel', (params) =>
  harness.cancel(HarnessCancelParamsSchema.parse(params).planId))
registerHandler('harness.modelSettings', (params) => {
  EmptyParamsSchema.parse(params)
  return harnessModel.settings()
})
registerHandler('harness.updateModelSettings', (params) =>
  harnessModel.update(HarnessModelSettingsUpdateSchema.parse(params)))
registerHandler('harness.checkModelConnection', (params) => {
  EmptyParamsSchema.parse(params)
  return chatHarness.checkConnection()
})
registerHandler('harness.applyPaperWiki', (params) =>
  harness.applyPaperWiki(HarnessApplyPaperWikiParamsSchema.parse(params)))
registerHandler('harness.rejectPaperWiki', (params) =>
  harness.rejectPaperWiki(HarnessRejectPaperWikiParamsSchema.parse(params)))
registerHandler('papers.columns', (params) => {
  EmptyParamsSchema.parse(params)
  return store.paperColumns()
})
registerHandler('papers.setColumns', (params) =>
  store.setPaperColumns(PapersSetColumnsParamsSchema.parse(params).columns))
registerHandler('papers.renameOption', (params) => {
  const { key, from, to } = PapersRenameOptionParamsSchema.parse(params)
  return store.renamePaperOption(key, from, to)
})
registerHandler('papers.setColumnType', (params) => {
  const { key, type } = PapersSetColumnTypeParamsSchema.parse(params)
  return store.setPaperColumnType(key, type)
})
registerHandler('project.list', (params) => {
  EmptyParamsSchema.parse(params)
  return store.listProjects()
})
registerHandler('project.overview', (params) => {
  EmptyParamsSchema.parse(params)
  return store.overviewProjects()
})
registerHandler('project.create', (params) =>
  store.createProject(ProjectCreateParamsSchema.parse(params).name))
registerHandler('project.get', (params) => store.getProject(ProjectGetParamsSchema.parse(params).id))
registerHandler('project.bindWorkspace', (params) => {
  const { id, binding } = ProjectBindWorkspaceParamsSchema.parse(params)
  return store.bindProjectWorkspace(id, binding)
})
registerHandler('project.update', (params) => {
  const { id, patch } = ProjectUpdateParamsSchema.parse(params)
  return store.updateProject(id, definedFields(patch))
})
registerHandler('project.delete', (params) =>
  store.deleteProject(ProjectDeleteParamsSchema.parse(params).id))
registerHandler('project.createTask', (params) => {
  const { projectId, task } = ProjectCreateTaskParamsSchema.parse(params)
  return store.createTask(projectId, task)
})
registerHandler('project.updateTask', (params) => {
  const { projectId, taskId, patch } = ProjectUpdateTaskParamsSchema.parse(params)
  return store.updateTask(projectId, taskId, definedFields(patch))
})
registerHandler('project.deleteTask', (params) => {
  const { projectId, taskId } = ProjectDeleteTaskParamsSchema.parse(params)
  return store.deleteTask(projectId, taskId)
})
registerHandler('project.reorderTasks', (params) => {
  const { projectId, order } = ProjectReorderTasksParamsSchema.parse(params)
  return store.reorderTasks(projectId, order)
})
registerHandler('project.createMilestone', (params) => {
  const { projectId, milestone } = ProjectCreateMilestoneParamsSchema.parse(params)
  return store.createMilestone(projectId, milestone)
})
registerHandler('project.updateMilestone', (params) => {
  const { projectId, milestoneId, patch } = ProjectUpdateMilestoneParamsSchema.parse(params)
  return store.updateMilestone(projectId, milestoneId, definedFields(patch))
})
registerHandler('project.deleteMilestone', (params) => {
  const { projectId, milestoneId } = ProjectDeleteMilestoneParamsSchema.parse(params)
  return store.deleteMilestone(projectId, milestoneId)
})
registerHandler('project.createRelation', (params) => {
  const { projectId, relation } = ProjectCreateRelationParamsSchema.parse(params)
  return store.createRelation(projectId, relation)
})
registerHandler('project.deleteRelation', (params) => {
  const { projectId, relationId } = ProjectDeleteRelationParamsSchema.parse(params)
  return store.deleteRelation(projectId, relationId)
})
registerHandler('project.addPaper', (params) => {
  const { projectId, paperId } = ProjectPaperParamsSchema.parse(params)
  return store.addPaper(projectId, paperId)
})
registerHandler('project.removePaper', (params) => {
  const { projectId, paperId } = ProjectPaperParamsSchema.parse(params)
  return store.removePaper(projectId, paperId)
})
registerHandler('project.moveRelation', (params) => {
  const { projectId, id, index } = ProjectMoveRelationParamsSchema.parse(params)
  return store.moveRelation(projectId, id, index)
})
registerHandler('project.reorder', (params) =>
  store.reorderProjects(ProjectReorderParamsSchema.parse(params).order))
registerHandler('project.createAttachment', (params) => {
  const { projectId, attachment } = ProjectCreateAttachmentParamsSchema.parse(params)
  return store.createAttachment(projectId, attachment)
})
registerHandler('project.deleteAttachment', (params) => {
  const { projectId, attachmentId } = ProjectDeleteAttachmentParamsSchema.parse(params)
  return store.deleteAttachment(projectId, attachmentId)
})
registerHandler('project.createConclusion', (params) => {
  const { projectId, text, chat, paper } = ProjectCreateConclusionParamsSchema.parse(params)
  return store.createConclusion(projectId, text, definedFields({ chat, paper }))
})
registerHandler('project.setConclusionState', (params) => {
  const { projectId, conclusionId, state } = ProjectSetConclusionStateParamsSchema.parse(params)
  return store.setConclusionState(projectId, conclusionId, state)
})
registerHandler('project.deleteConclusion', (params) => {
  const { projectId, conclusionId } = ProjectDeleteConclusionParamsSchema.parse(params)
  return store.deleteConclusion(projectId, conclusionId)
})
registerHandler('inbox.list', (params) => {
  return store.listInbox(InboxListParamsSchema.parse(params))
})
registerHandler('inbox.dismiss', (params) =>
  store.dismissInbox(InboxDismissParamsSchema.parse(params).id))
registerHandler('inbox.readLater', (params) =>
  store.readLater(InboxReadLaterParamsSchema.parse(params).id))
registerHandler('inbox.download', (params) =>
  background.downloadInbox(InboxDownloadParamsSchema.parse(params).id))
registerHandler('inbox.fetch', (params) => {
  EmptyParamsSchema.parse(params)
  void background.fetchWatches()
})
registerHandler('delivery.settings', (params) => {
  EmptyParamsSchema.parse(params)
  return store.deliverySettings()
})
registerHandler('delivery.updateSettings', (params) => {
  const settings = DeliverySettingsSchema.parse(params)
  return store.setDeliverySettings(settings)
})
registerHandler('discovery.profiles', (params) => {
  EmptyParamsSchema.parse(params)
  return store.listDiscoveryProfiles()
})
registerHandler('discovery.fetch', (params) => {
  const { projectId, force } = DiscoveryFetchParamsSchema.parse(params)
  return background.fetchDiscoveries(projectId, force)
})
registerHandler('discovery.intent', (params) => {
  const { projectId, intentId, action } = DiscoveryIntentUpdateParamsSchema.parse(params)
  return store.setDiscoveryIntent(projectId, intentId, action)
})
registerHandler('discovery.feedback', (params) => {
  const { id, feedback } = DiscoveryFeedbackParamsSchema.parse(params)
  return store.feedbackDiscovery(id, feedback)
})
registerHandler('later.list', (params) => {
  EmptyParamsSchema.parse(params)
  return store.listLater()
})
registerHandler('later.remove', (params) =>
  store.removeLater(LaterRemoveParamsSchema.parse(params).id))
registerHandler('watch.list', (params) => {
  EmptyParamsSchema.parse(params)
  return store.listWatches()
})
registerHandler('author.search', (params) =>
  background.searchAuthors(AuthorSearchParamsSchema.parse(params).query))
registerHandler('watch.suggest', (params) => {
  const input = WatchSuggestionParamsSchema.parse(params)
  if (input.source === 'focus') return background.suggestWatches({ focus: input.focus })
  const project = store.getProject(input.projectId)
  const profile = store.discoveryProfile(input.projectId)
  const intentTopics = store.discoveryIntents(input.projectId)
    .filter((intent) => intent.enabled)
    .flatMap((intent) => intent.label.split(/[·|/]/).map((part) => part.trim()))
  // Search by what the project's papers are about; the project's name and plan wording make a poor query.
  const focus = [intentTopics, profile.wikiTerms ?? []]
    .map((terms) => [...new Set(terms)].slice(0, 6).join(' ')).find((terms) => terms.length >= 3) ?? profile.anchorText
  return background.suggestWatches({
    focus,
    seedTopics: [project.topic, ...(profile.wikiTerms ?? []), ...intentTopics]
      .map((topic) => topic.trim()).filter((topic) => topic !== '' && topic !== '未分主题'),
  })
})
registerHandler('watch.create', (params) => {
  const { watch } = WatchCreateParamsSchema.parse(params)
  const before = new Set(store.listWatches().map((item) => item.id))
  store.createWatch(watch)
  const added = store.listWatches().filter((item) => !before.has(item.id)).map((item) => item.id)
  if (scheduled) void background.fetchWatches(added)
})
registerHandler('watch.update', (params) => {
  const { id, watch } = WatchUpdateParamsSchema.parse(params)
  store.updateWatch(id, watch)
  if (scheduled && store.listWatches().find((item) => item.id === id)?.active) {
    void background.fetchWatches([id])
  }
})
registerHandler('watch.setActive', (params) => {
  const { id, active } = WatchSetActiveParamsSchema.parse(params)
  return store.setWatchActive(id, active)
})
registerHandler('watch.delete', (params) =>
  store.deleteWatch(WatchDeleteParamsSchema.parse(params).id))
registerHandler('wiki.home', (params) => {
  EmptyParamsSchema.parse(params)
  return store.wikiHome()
})
registerHandler('wiki.aggregation', (params) =>
  store.wikiAggregation(WikiAggregationParamsSchema.parse(params).id))
registerHandler('wiki.paper', (params) => store.wikiPaper(WikiPaperParamsSchema.parse(params).id))
registerHandler('wiki.cards', (params) => {
  EmptyParamsSchema.parse(params)
  return store.wikiCards()
})
registerHandler('wiki.apply', (params) =>
  store.applyProposal(WikiApplyParamsSchema.parse(params).proposal))
registerHandler('wiki.update', (params) => {
  const { id, body } = WikiUpdateParamsSchema.parse(params)
  return store.updateWikiPage(id, body)
})
registerHandler('trash.list', (params) => {
  EmptyParamsSchema.parse(params)
  return store.listTrash()
})
registerHandler('trash.restore', (params) => store.restoreTrash(TrashRestoreParamsSchema.parse(params).id))
registerHandler('trash.purge', (params) => store.purgeTrash(TrashPurgeParamsSchema.parse(params).id))
registerHandler('trash.clear', (params) => {
  EmptyParamsSchema.parse(params)
  store.clearTrash()
})
registerHandler('changelog.list', (params) => {
  EmptyParamsSchema.parse(params)
  return store.listChanges()
})
registerHandler('changelog.undo', (params) =>
  store.undoChange(ChangelogUndoParamsSchema.parse(params).id))
registerHandler('changelog.archive', (params) =>
  store.archiveChange(ChangelogArchiveParamsSchema.parse(params).id))
registerHandler('changelog.archiveAll', (params) => {
  EmptyParamsSchema.parse(params)
  store.archiveAllChanges()
})
registerHandler('changelog.delete', (params) =>
  store.deleteChange(ChangelogDeleteParamsSchema.parse(params).id))
registerHandler('changelog.clearArchived', (params) => {
  EmptyParamsSchema.parse(params)
  store.clearArchivedChanges()
})
registerHandler('feed.list', (params) => {
  EmptyParamsSchema.parse(params)
  return store.listFeed()
})
registerHandler('feed.append', (params) => store.appendFeed(FeedAppendParamsSchema.parse(params)))
registerHandler('chat.list', (params) => {
  EmptyParamsSchema.parse(params)
  return store.listChats()
})
registerHandler('chat.messages', (params) =>
  store.chatMessages(ChatMessagesParamsSchema.parse(params).id))
registerHandler('chat.create', (params) => {
  const { title, named } = ChatCreateParamsSchema.parse(params)
  return store.createChat(title, named)
})
registerHandler('chat.forPaper', (params) =>
  store.chatForPaper(ChatForPaperParamsSchema.parse(params).paperId))
registerHandler('chat.append', (params) => {
  const { id, messages } = ChatAppendParamsSchema.parse(params)
  return store.appendChatMessages(id, messages)
})
registerHandler('chat.send', (params) => {
  const { id, text } = ChatSendParamsSchema.parse(params)
  return chatService.send(id, text)
})
registerHandler('chat.cancel', (params) =>
  chatService.cancel(ChatCancelParamsSchema.parse(params).id))
registerHandler('idea.list', (params) => {
  EmptyParamsSchema.parse(params)
  return store.listIdeas()
})
registerHandler('idea.create', (params) => {
  const { chatId, title, body } = ResearchIdeaCreateParamsSchema.parse(params)
  return store.createIdea(chatId, title, body)
})
registerHandler('idea.update', (params) => {
  const { id, patch } = ResearchIdeaUpdateParamsSchema.parse(params)
  return store.updateIdea(id, definedFields(patch))
})
registerHandler('idea.promote', (params) => {
  const { id } = ResearchIdeaPromoteParamsSchema.parse(params)
  const held = store.listIdeas().find((idea) => idea.id === id)
  if (held === undefined) throw new Error(`想法不存在:${id}`)
  if (held.project !== undefined) throw new Error('这个想法已经关联项目')
  const before = new Set(store.listProjects().map((project) => project.id))
  store.createProject(held.title)
  const made = store.listProjects().find((project) => !before.has(project.id))
  if (made === undefined) throw new Error('由想法创建项目后没有找到新项目')
  const project = store.updateProject(made.id, {
    memo: `## 起点想法\n\n${held.body}\n\n来源对话：${held.source.chatTitle}`,
  })
  return { idea: store.updateIdea(id, { project: project.id }), project }
})
registerHandler('idea.placeOnGraph', (params) => {
  const { id, placement } = ResearchIdeaPlaceOnGraphParamsSchema.parse(params)
  return placeResearchIdeaOnGraph(store, id, placement)
})
registerHandler('idea.delete', (params) =>
  store.deleteIdea(ResearchIdeaDeleteParamsSchema.parse(params).id))
registerHandler('idea.reorder', (params) =>
  store.reorderIdeas(ResearchIdeaReorderParamsSchema.parse(params).order))
registerHandler('chat.recordAction', (params) => {
  const { id, messageId } = ChatRecordActionParamsSchema.parse(params)
  return store.recordAction(id, messageId)
})
registerHandler('chat.setArchived', (params) => {
  const { id, archived } = ChatSetArchivedParamsSchema.parse(params)
  return store.setChatArchived(id, archived)
})
registerHandler('search.query', (params) => store.search(SearchParamsSchema.parse(params).query))
registerHandler('jobs.status', (params) => {
  EmptyParamsSchema.parse(params)
  const status = background.status()
  return showUiSamples ? withUiSampleUpload(status, Date.now()) : status
})

const missingHandlers = CONTRACT_METHODS.filter((method) => !handlers.has(method))
if (missingHandlers.length > 0) {
  throw new Error(`Core 缺少契约方法:${missingHandlers.join(',')}`)
}
markHandlersReady()
