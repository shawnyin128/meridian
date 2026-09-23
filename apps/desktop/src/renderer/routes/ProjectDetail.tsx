import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  ProjectDetail as Project, ResearchGraph as ResearchGraphData, ResearchIdea,
  ResearchIdeaGraphPlacement, TaskWindow,
} from '../../shared/contract.js'
import { projectControlState } from '../../shared/project-control.js'
import { researchPathState } from '../../shared/research-path.js'
import {
  FOCUS_KEY, projectDecisionItems, recordKind, recordOrigin, sortRecordsNewestFirst,
} from '../../shared/project-signals.js'
import { PROJECT_STATUSES } from '../../shared/vocabulary.js'
import { appMenu, files, idea as ideaApi, papers, project as projectApi, wiki } from '../ipc.js'
import {
  useBanner, useCrumbTail, useEscapeLayer, useJump, useToast, useToday, useVaultRevision,
} from '../shell/AppShell.js'
import { AddAction } from '../components/AddAction.js'
import { MenuItem } from '../components/ActionMenu.js'
import { EmptyState } from '../components/EmptyState.js'
import { DetailPanel } from '../components/DetailPanel.js'
import { PanelClose } from '../components/PanelClose.js'
import { ChoicePicker, DateButton, DotsMenu, PriorityPicker } from '../components/FieldPickers.js'
import { SegmentedControl } from '../components/SegmentedControl.js'
import { StructuredList, StructuredRow } from '../components/StructuredList.js'
import {
  ProjectEventRow, ProjectSignalDate, ProjectSignalKind,
} from '../components/project/ProjectSignals.js'
import {
  ProjectBlockerView, ProjectNextActionView,
} from '../components/project/ProjectControl.js'
import { ProjectIdentityFields, ProjectPriorityTag } from '../components/project/ProjectIdentity.js'
import {
  attachmentSizeText, PROJECT_PAPER_GROUP, PROJECT_RELATION_GROUPS, PROJECT_URL_GROUP, ProjectAgentSessions,
  ProjectAttachments, ProjectMemo, ProjectRelations, ProjectTopicField, ProjectUrlDraft,
} from '../components/project/ProjectSections.js'
import { NodeTag } from '../components/project/NodeTag.js'
import { ProjectConclusions } from '../components/project/ProjectConclusions.js'
import { ProjectTimeline } from '../components/project/ProjectTimeline.js'
import { nodeMode, ResearchGraph, ResearchNodePanel } from '../components/project/ResearchGraph.js'
import {
  IdeaGraphDialog, type IdeaGraphDialogMode,
} from '../components/ideas/IdeaGraphDialog.js'
import { ProjectPlan } from '../components/project/ProjectPlan.js'
import type { PlanCreating, PlanTab } from '../components/project/ProjectPlan.js'
import { BackButton } from '../components/BackButton.js'
import { dnum } from '../../shared/dates.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import { InlineMetadataField } from '../components/InlineField.js'
import { ModalDialog, ModalTitle } from '../components/ModalDialog.js'
import { DirectoryField, FormInput } from '../components/FormControls.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { PickRow, type PickHit } from '../components/PickRow.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import './shell.css'
import './ProjectDetail.css'

/** Two segments of scientific research records. */
export type RecordTab = 'tl' | 'graph'

export function ProjectIdeaPanel({
  idea, graph, workspaceManaged, onClose, onOpenIdea, onCreateNode, onLinkNode,
  onOpenNode, onUnlinkNode,
}: {
  idea: ResearchIdea
  graph: ResearchGraphData
  workspaceManaged: boolean
  onClose: () => void
  onOpenIdea: () => void
  onCreateNode: () => void
  onLinkNode: () => void
  onOpenNode: (nodeId: string) => void
  onUnlinkNode: () => void
}) {
  const fmt = useFormat()
  const m = useMessages()
  const source = idea.source.paperTitle === undefined
    ? idea.source.chatTitle
    : `${idea.source.paperTitle} · ${idea.source.chatTitle}`
  const linkedNode = graph.nodes.find((node) => node.id === idea.node)
  return (
    <>
      <SectionHeading
        variant="rail" className="node-document-head"
        actions={<PanelClose onClose={onClose} />}
      ><span className="node-document-title">{idea.title}</span>
      </SectionHeading>
      <div className="project-idea-detail-meta">
        <span className="project-idea-detail-kind">{m.project.idea.kind}</span>
        {idea.archived ? <span className="project-idea-state">{m.common.archived}</span> : null}
        <button className="btn project-idea-open-idea" onClick={onOpenIdea}>{m.project.idea.openIdea}</button>
      </div>
      <SectionHeading variant="rail">{m.project.sections.content}</SectionHeading>
      <p className="project-idea-detail-body">{idea.body}</p>
      <SectionHeading variant="rail">{m.project.sections.source}</SectionHeading>
      <p className="project-idea-detail-source">{source}</p>
      <div className="project-idea-detail-updated">{m.common.updatedOn(fmt.date(idea.updated))}</div>
      <SectionHeading variant="rail">{m.project.sections.graph}</SectionHeading>
      {idea.node !== undefined && linkedNode !== undefined
        ? (
          <div className="project-idea-node-link">
            <button
              className="project-idea-node"
              onClick={() => onOpenNode(linkedNode.id)}
            >
              {linkedNode.label}
            </button>
            <span className="project-idea-node-actions">
              <button className="btn plain" onClick={onLinkNode}>{m.project.idea.changeNode}</button>
              <button className="btn plain" onClick={onUnlinkNode}>{m.project.idea.unlinkNode}</button>
            </span>
          </div>
        )
        : (
          <div className="project-idea-graph-actions">
            {!workspaceManaged
              ? <button className="btn pri" onClick={onCreateNode}>{m.project.idea.createNode}</button>
              : null}
            <button className="btn" disabled={graph.nodes.length === 0} onClick={onLinkNode}>
              {m.project.idea.linkExistingNode}
            </button>
          </div>
        )}
    </>
  )
}

/**
 * Project details: Gantt timeline, task and milestone list, scientific research record timeline, property panel on the right.
 * `projectId` is the project to be displayed, the data is obtained through project.get, and the addition, deletion and modification of tasks and milestones are
 * project.createTask / updateTask / deleteTask and the corresponding milestone methods, the project attributes are
 * project.update writes back to core. `onBack` hangs on the "project" section of the breadcrumbs and returns to the project list.
 * It must maintain the same reference between re-renders; `onReturn` is hung on the return button in the content navigation row, returning to the original screen.
 * Return to the project list when there is no way.
 * The selected items of the two groups of segments are held by the calling site (the demo's projPlanTab / projTab are module-level variables), so
 * When you leave the project and come in again, you will stop at the last paragraph; `onTab` and `onRecord` must also maintain the same reference.
 */
export function ProjectDetail({
  projectId, onBack, onReturn, tab, onTab, record, onRecord, arrivalTask = null, onArrived,
}: {
  projectId: string
  onBack: () => void
  /** The history return action: return to that screen if jumped from another screen, return to the list if entered from the project list. */
  onReturn: () => void
  tab: PlanTab
  onTab: (tab: PlanTab) => void
  record: RecordTab
  onRecord: (record: RecordTab) => void
  /** A task to locate once the project has loaded, as when the overview timeline opens it. */
  arrivalTask?: string | null
  onArrived?: () => void
}) {
  const fmt = useFormat()
  const m = useMessages()
  const [project, setProject] = useState<Project | null>(null)
  const [linkedIdeas, setLinkedIdeas] = useState<ResearchIdea[]>([])
  const [relAdding, setRelAdding] = useState(false)
  const [relGroup, setRelGroup] = useState<string>(PROJECT_RELATION_GROUPS[0])
  const [creating, setCreating] = useState<PlanCreating | null>(null)
  // Change a new object every time you position it: when you click on the same line, the identity of the object changes to make the following effect run again.
  const [flash, setFlash] = useState<{ id: string } | null>(null)
  const [hoverMilestone, setHoverMilestone] = useState<string | null>(null)
  const [memoEditing, setMemoEditing] = useState(false)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)
  const [ideaGraphDialog, setIdeaGraphDialog] = useState<{
    ideaId: string
    mode: IdeaGraphDialogMode
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaceMode, setWorkspaceMode] = useState<'local' | 'ssh'>('local')
  const [localPath, setLocalPath] = useState('')
  const [sshHost, setSshHost] = useState('')
  const [sshPath, setSshPath] = useState('')
  const [sshPort, setSshPort] = useState('')
  const planList = useRef<HTMLDivElement>(null)
  const planAdd = useRef<HTMLButtonElement>(null)
  const ganttAdd = useRef<HTMLButtonElement>(null)
  const msLane = useRef<HTMLDivElement>(null)
  const relRow = useRef<HTMLDivElement>(null)
  const relAdd = useRef<HTMLButtonElement>(null)
  const relTriggers = useMemo(() => [relAdd], [])

  const stopRel = useCallback(() => {
    setRelAdding(false)
  }, [])
  const banner = useBanner()
  const toast = useToast()
  const today = useToday()
  const clearNode = useCallback(() => setSelectedNode(null), [])
  const clearIdea = useCallback(() => setSelectedIdeaId(null), [])
  const { revision } = useVaultRevision()
  const { open: jumpTo } = useJump()
  const openWikiPage = (page: string) => jumpTo('wiki', page)
  const reportError = useCallback((e: Error) => setError(e.message), [])
  const write = useVaultWrite()
  const heldPapers = project?.papers
  const suggestPapers = useCallback(async (query: string): Promise<PickHit[]> => {
    if (query === '') return []
    const { rows } = await papers.list({ page: 1, size: 8, filter: query })
    return rows
      .filter((row) => !(heldPapers ?? []).includes(row.id))
      .map((row) => ({
        id: row.id,
        title: row.title,
        ...(row.year === undefined ? {} : { meta: String(row.year) }),
      }))
  }, [heldPapers])
  const suggestPages = useCallback(async (query: string): Promise<PickHit[]> => {
    if (query === '') return []
    const needle = query.toLowerCase()
    return (await wiki.cards())
      .filter((card) => card.title.toLowerCase().includes(needle))
      .map((card) => ({ id: card.id, title: card.title }))
  }, [])

  const name = project?.name
  useCrumbTail(useMemo(() => (name === undefined ? [] : [{ text: name }]), [name]), onBack)

  // Writing outside this screen will also be changed to this project (recovering attachments from the trash can), so follow revision to retrieve it.
  useEffect(() => {
    void projectApi.get(projectId).then(setProject).catch(reportError)
  }, [projectId, reportError, revision])

  // The idea is to store the project id in itself, so the project details are back-projected here to form a two-way visible association.
  useEffect(() => {
    void ideaApi.list()
      .then((ideas) => setLinkedIdeas(ideas.filter((idea) => idea.project === projectId)))
      .catch(reportError)
  }, [projectId, reportError, revision])

  // Follows external materializer when project details is on; SSH requires process and network connection, less frequently than local directory.
  const workspaceKey = project?.workspace === undefined
    ? undefined
    : [project.workspace.kind, project.workspace.host, project.workspace.port, project.workspace.root].join(':')
  const workspaceKind = project?.workspace?.kind
  useEffect(() => {
    if (workspaceKey === undefined) return
    const timer = window.setInterval(() => {
      void projectApi.get(projectId).then(setProject).catch(reportError)
    }, workspaceKind === 'ssh' ? 15_000 : 2000)
    return () => window.clearInterval(timer)
  }, [projectId, reportError, workspaceKey, workspaceKind])

  useEffect(() => {
    setSelectedNode(null)
    setSelectedIdeaId(null)
    setIdeaGraphDialog(null)
  }, [projectId])

  useEffect(() => {
    if (selectedIdeaId !== null && !linkedIdeas.some((idea) => idea.id === selectedIdeaId)) {
      setSelectedIdeaId(null)
    }
  }, [linkedIdeas, selectedIdeaId])

  useEscapeLayer(selectedNode !== null, clearNode)
  useEscapeLayer(selectedIdeaId !== null, clearIdea)

  // Switching the record view swaps content of a different height under the heading. The heading is
  // kept where it was on screen so the switch does not read as the page moving.
  const recordHeading = useRef<HTMLDivElement>(null)
  const recordHeadingTop = useRef<number | null>(null)
  const holdRecordHeading = () => {
    recordHeadingTop.current = recordHeading.current?.getBoundingClientRect().top ?? null
  }
  useLayoutEffect(() => {
    const held = recordHeadingTop.current
    const heading = recordHeading.current
    if (held === null || heading === null) return
    recordHeadingTop.current = null
    const scroller = heading.closest('.desk-body')
    if (scroller !== null) scroller.scrollTop += heading.getBoundingClientRect().top - held
  }, [record])

  // A newly opened node or idea starts at the top of the panel, not where the previous one was scrolled to.
  useEffect(() => {
    document.querySelector('.screenslot:not([hidden]) .node-document-pane')?.scrollTo({ top: 0 })
  }, [selectedNode, selectedIdeaId])

  useEffect(() => {
    if (!flash) return
    const row = planList.current?.querySelector<HTMLElement>(`[data-row="${flash.id}"]`)
    if (row) {
      row.scrollIntoView({ block: 'nearest' })
      // The class of the row has not changed. If you do not remove the animation and force the layout again, the second positioning of the same row will not replay and flicker.
      row.style.animation = 'none'
      row.getBoundingClientRect()
      row.style.animation = ''
    }
    const timer = window.setTimeout(() => setFlash(null), 1200)
    return () => window.clearTimeout(timer)
  }, [flash])

  /**
   * Discard the New Row, Related Forms, and Essay Editors that are currently open.
   * The renderProject corresponding to the demo rewrites the entire deskBody - the rows and forms inserted inside are gone.
   * The essay frame is also reconstructed from the original text.
   */
  const discardOpenEdits = useCallback(() => {
    setCreating(null)
    stopRel()
    setMemoEditing(false)
  }, [stopRel])

  /**
   * Receive the result of the next write operation: the written item is entered into state, and then completed by write (the whole library version is incremented, and the note is not empty)
   * Use notify prompt (default confirmation banner); if written, an error will be reported and false will be returned. Placeholder submission goes like this:
   * The position will be collected by itself according to success or failure, and will not be lost here.
   */
  const writeProject = (
    op: Promise<Project>, note?: string, notify: (text: string) => void = banner,
  ): Promise<boolean> => write(op.then((p) => setProject(p)), { note, notify })

  /** Non-placeholder writing: First discard the editor that is open at the moment, and rewrite the entire deskBody corresponding to the renderProject of the demo. */
  const applyWrite = (
    op: Promise<Project>, note?: string, notify: (text: string) => void = banner,
  ) => {
    discardOpenEdits()
    void writeProject(op, note, notify)
  }

  const chooseLocalWorkspace = async () => {
    const root = await appMenu.chooseWorkspaceRoot()
    if (root !== null) setLocalPath(root)
  }

  const connectLocalWorkspace = async () => {
    const connected = await writeProject(
      projectApi.bindWorkspace(projectId, { kind: 'local', root: localPath.trim() }),
      m.project.workspace.connected, toast,
    )
    if (connected) setWorkspaceOpen(false)
  }

  const openWorkspace = () => {
    const workspace = project?.workspace
    const ssh = workspace?.kind === 'ssh'
    setWorkspaceMode(ssh ? 'ssh' : 'local')
    setLocalPath(workspace?.kind === 'local' ? workspace.root : '')
    setSshHost(ssh ? workspace.host ?? '' : '')
    setSshPath(ssh ? workspace.root : '')
    setSshPort(ssh && workspace.port !== undefined ? String(workspace.port) : '')
    setWorkspaceOpen(true)
  }

  const connectSshWorkspace = async () => {
    const port = sshPort.trim() === '' ? undefined : Number(sshPort)
    const connected = await writeProject(projectApi.bindWorkspace(projectId, {
      kind: 'ssh', host: sshHost.trim(), path: sshPath.trim(),
      ...(port === undefined ? {} : { port }),
    }), m.project.workspace.sshConnected, toast)
    if (connected) setWorkspaceOpen(false)
  }

  const refreshWorkspace = () => {
    void projectApi.get(projectId).then(setProject).catch(reportError)
  }

  const locatePlanRow = useCallback((kind: PlanTab, id: string) => {
    if (tab !== kind) {
      onTab(kind)
      discardOpenEdits()
    }
    setFlash({ id })
  }, [tab, onTab, discardOpenEdits])
  const locateTask = useCallback((taskId: string) => locatePlanRow('task', taskId), [locatePlanRow])

  useEffect(() => {
    if (arrivalTask === null || project?.id !== projectId) return
    locateTask(arrivalTask)
    onArrived?.()
  }, [arrivalTask, project, projectId, locateTask, onArrived])
  const locateMilestone = useCallback(
    (milestoneId: string) => locatePlanRow('ms', milestoneId), [locatePlanRow],
  )

  if (!project) {
    return (
      <PageShell>
        <PageHeader>
          <BackButton onClick={onReturn} />
          <PageTitle>{m.project.loadingTitle}</PageTitle>
        </PageHeader>
        <PageError error={error} />
        <PageBody />
      </PageShell>
    )
  }

  /** Which half of the list does the new row belong to; null means there is no new row. */
  const openRowKind: PlanTab | null = creating?.kind ?? null

  /** When there is already a new row in the same segment, return the focus to it to avoid opening a second row. */
  const focusOpenRow = (kind: PlanTab) => {
    if (openRowKind !== kind) return false
    planList.current?.querySelector<HTMLInputElement>('.min')?.focus()
    return true
  }

  const startTask = (date = today, window: TaskWindow | null = null) => {
    onTab('task')
    if (focusOpenRow('task')) return
    setCreating({ kind: 'task', date, window })
  }

  const startMilestone = (date: string) => {
    onTab('ms')
    if (focusOpenRow('ms')) return
    setCreating({ kind: 'ms', date })
  }

  /** The local files dragged or clicked are created into attachments in sequence. Only the absolute path is recorded and the original file is not copied. */
  const addAttachments = (dropped: File[]) => {
    const local = dropped.filter((file) => files.pathOf(file) !== '')
    if (local.length < dropped.length) toast(m.project.attachments.localOnly)
    if (local.length === 0) return
    let chain = Promise.resolve(project)
    for (const file of local) {
      chain = chain.then(() =>
        projectApi.createAttachment(projectId, {
          name: file.name, size: attachmentSizeText(file.size), path: files.pathOf(file),
        }))
    }
    applyWrite(chain, m.project.attachments.added(local.length))
  }

  const workspaceGraph = project.workspace?.graph
  const displayedGraph = workspaceGraph ?? project.graph
  const visibleEvents = [...project.events, ...(project.workspace?.events ?? [])]
  const sortedRecords = sortRecordsNewestFirst(visibleEvents)
  const goToRecordNode = (nodeId: string) => {
    holdRecordHeading()
    onRecord('graph')
    setSelectedIdeaId(null)
    setSelectedNode(nodeId)
    discardOpenEdits()
  }
  const attn = projectDecisionItems({
    status: project.status,
    // Old project conclusions are reserved for data compatibility only and no longer participate in the attention signal of the project page.
    conclusions: { conflicting: 0 },
    milestones: project.milestones,
    events: visibleEvents,
    tasks: project.tasks,
    research: { pathState: researchPathState(displayedGraph) },
    ...(project.block === undefined ? {} : { block: project.block }),
    ...(project.conflictPage === undefined ? {} : { conflictPage: project.conflictPage }),
  }, today, m.project.signals)
  const controlState = projectControlState({
    tasks: project.tasks,
    ...(project.block === undefined ? {} : { block: project.block }),
    ...(displayedGraph.activeNodes === undefined
      ? {}
      : {
        activeNodes: displayedGraph.activeNodes.flatMap((id) => {
          const activeNode = displayedGraph.nodes.find((candidate) => candidate.id === id)
          return activeNode === undefined ? [] : [activeNode]
        }),
      }),
  })
  const node = displayedGraph.nodes.find((n) => n.id === selectedNode)
  const selectedIdea = linkedIdeas.find((idea) => idea.id === selectedIdeaId)
  const dialogIdea = linkedIdeas.find((idea) => idea.id === ideaGraphDialog?.ideaId)
  const detailOpen = node !== undefined || selectedIdea !== undefined
  const workspaceLeaf = project.workspace?.root.split(/[\\/]/).filter(Boolean).at(-1)
  const workspaceName = project.workspace?.kind === 'ssh'
    ? `${project.workspace.host}:${workspaceLeaf ?? project.workspace.root}`
    : workspaceLeaf

  const placeIdeaOnGraph = async (
    idea: ResearchIdea, placement: ResearchIdeaGraphPlacement,
  ): Promise<boolean> => {
    let nodeId: string | null = null
    const note = placement.kind === 'create'
      ? m.project.idea.placedCreated
      : placement.kind === 'link'
        ? m.project.idea.placedLinked
        : m.project.idea.placedUnlinked
    const saved = await write(
      ideaApi.placeOnGraph(idea.id, placement).then((result) => {
        nodeId = result.nodeId
        setProject(result.project)
        setLinkedIdeas((held) => held.map((candidate) => (
          candidate.id === result.idea.id ? result.idea : candidate
        )))
      }),
      { note },
    )
    if (saved && nodeId !== null) {
      onRecord('graph')
      setSelectedIdeaId(null)
      setSelectedNode(nodeId)
    }
    return saved
  }

  return (
    <PageShell>
      <PageHeader>
        <BackButton onClick={onReturn} />
        <PageTitle>{project.name}</PageTitle>
      </PageHeader>
      <PageError error={error} />

      <ModalDialog
        open={workspaceOpen} onOpenChange={setWorkspaceOpen} contentClassName="workspace-dialog"
      >
            <ModalTitle className="workspace-dialog-title">{m.project.workspace.dialogTitle}</ModalTitle>
            <SegmentedControl
              className="workspace-kinds"
              label={m.project.workspace.kindLabel}
              value={workspaceMode}
              options={[
                { value: 'local', label: m.project.workspace.local },
                { value: 'ssh', label: 'SSH' },
              ]}
              onChange={setWorkspaceMode}
            />
            {workspaceMode === 'local'
              ? (
                <form
                  className="workspace-form"
                  onSubmit={(event) => { event.preventDefault(); void connectLocalWorkspace() }}
                >
                  <label>{m.project.workspace.pathLabel}
                    <DirectoryField
                      value={localPath} autoFocus required placeholder={m.project.workspace.localPlaceholder}
                      chooseLabel={m.project.workspace.chooseLocal}
                      onChoose={() => { void chooseLocalWorkspace() }}
                      onChange={(event) => setLocalPath(event.target.value)}
                    />
                  </label>
                  <div className="workspace-dialog-actions">
                    <button type="button" className="btn" onClick={() => setWorkspaceOpen(false)}>{m.common.cancel}</button>
                    <button type="submit" className="workspace-local btn pri">{m.project.workspace.add}</button>
                  </div>
                </form>
              )
              : (
                <form
                  className="workspace-form"
                  onSubmit={(event) => { event.preventDefault(); void connectSshWorkspace() }}
                >
                  <label>{m.project.workspace.hostLabel}
                    <FormInput
                      appearance="field" value={sshHost} autoFocus required
                      placeholder={m.project.workspace.hostPlaceholder}
                      onChange={(event) => setSshHost(event.target.value)}
                    />
                  </label>
                  <label>{m.project.workspace.pathLabel}
                    <FormInput
                      appearance="field" value={sshPath} required placeholder={m.project.workspace.remotePlaceholder}
                      onChange={(event) => setSshPath(event.target.value)}
                    />
                  </label>
                  <label>{m.project.workspace.portLabel}
                    <FormInput
                      appearance="field" value={sshPort} type="number" min={1} max={65_535}
                      placeholder={m.project.workspace.portLabel}
                      onChange={(event) => setSshPort(event.target.value)}
                    />
                  </label>
                  <div className="workspace-dialog-actions">
                    <button type="button" className="btn" onClick={() => setWorkspaceOpen(false)}>{m.common.cancel}</button>
                    <button type="submit" className="btn pri">{m.project.workspace.connect}</button>
                  </div>
                </form>
              )}
      </ModalDialog>

      {dialogIdea !== undefined && ideaGraphDialog !== null
        ? (
          <IdeaGraphDialog
            open mode={ideaGraphDialog.mode} idea={dialogIdea} graph={displayedGraph}
            onOpenChange={(open) => { if (!open) setIdeaGraphDialog(null) }}
            onSubmit={(placement) => placeIdeaOnGraph(dialogIdea, placement)}
          />
        )
        : null}

      <PageBody>
        <SectionHeading>{m.project.sections.timeline}</SectionHeading>
        <ProjectTimeline
          project={project} hoverMilestone={hoverMilestone} onHoverMilestone={setHoverMilestone}
          onLocateTask={locateTask} onLocateMilestone={locateMilestone}
          onMoveTask={(taskId, start, end, days) => applyWrite(
            projectApi.updateTask(projectId, taskId, { start, end }),
            m.project.plan.taskMoved(days),
            toast,
          )}
          onMoveTaskWindow={(taskId, patch, slots) => applyWrite(
            projectApi.updateTask(projectId, taskId, patch),
            m.project.plan.taskWindowMoved(slots),
            toast,
          )}
          onMoveMilestone={(milestoneId, date) => applyWrite(
            projectApi.updateMilestone(projectId, milestoneId, { date }),
            m.project.plan.rescheduledTo(fmt.date(date)), toast,
          )}
          onNewTask={startTask} onNewMilestone={startMilestone}
          newActionRef={ganttAdd} milestoneLaneRef={msLane}
        />

        {attn.length > 0
          ? (
            <>
              <SectionHeading>{m.project.signals.heading(attn.length)}</SectionHeading>
              <StructuredList className="attn" variant="embedded">
                {attn.map((a) => (
                  <StructuredRow
                    className="attnrow project-signal-columns" key={a.id} data-wk={a.page}
                    {...(a.page === undefined ? {} : { onActivate: () => openWikiPage(a.page!) })}
                  >
                    <ProjectSignalKind tone={a.tone}>{a.kind}</ProjectSignalKind>
                    <ProjectSignalDate date={a.date} />
                    <span className="attn-text">{a.reason}</span>
                  </StructuredRow>
                ))}
              </StructuredList>
            </>
          )
          : null}

        <div className={`wkpage project-detail-page${detailOpen ? ' node-reading' : ''}`}>
          <div className="wkmain">
            {project.agentSessions.length > 0
              ? <ProjectAgentSessions sessions={project.agentSessions} />
              : null}

            <ProjectPlan
              project={project} tab={tab} today={today} creating={creating}
              flashId={flash?.id ?? null}
              listRef={planList} addRef={planAdd} timelineAddRef={ganttAdd} milestoneLaneRef={msLane}
              onTab={onTab} onDiscardOpenEdits={discardOpenEdits}
              onStartTask={() => startTask()} onStartMilestone={startMilestone}
              onCancelCreate={() => setCreating(null)} onHoverMilestone={setHoverMilestone}
              onCreateTask={({ window, ...draft }) => writeProject(
                projectApi.createTask(projectId, {
                  ...draft, ...(window === null ? {} : { window }),
                }),
                m.project.plan.taskCreated,
              )}
              onCreateMilestone={(draft) => writeProject(
                projectApi.createMilestone(projectId, draft), m.project.plan.milestoneCreated,
              )}
              onUpdateTask={(taskId, patch) => writeProject(
                projectApi.updateTask(projectId, taskId, patch), m.project.plan.taskUpdated,
              )}
              onDeleteTask={(taskId) => applyWrite(
                projectApi.deleteTask(projectId, taskId), m.project.plan.taskDeleted,
              )}
              onUpdateMilestone={(milestoneId, patch) => writeProject(
                projectApi.updateMilestone(projectId, milestoneId, patch), m.project.plan.milestoneUpdated,
              )}
              onDeleteMilestone={(milestoneId) => applyWrite(
                projectApi.deleteMilestone(projectId, milestoneId), m.project.plan.milestoneDeleted,
              )}
            />

            <SectionHeading variant="content" className="flexh" ref={recordHeading}>{m.project.sections.records}
              <div className="section-actions">
                <SegmentedControl
                  label={m.project.recordViewLabel}
                  value={record}
                  options={[
                    { value: 'tl', label: m.project.recordModes.list },
                    { value: 'graph', label: m.project.sections.graph },
                  ]}
                  onChange={(value) => {
                    holdRecordHeading()
                    onRecord(value)
                    if (value === 'tl') setSelectedNode(null)
                    discardOpenEdits()
                  }}
                />
              </div>
            </SectionHeading>
            <div className="record-view">
            <PageError error={project.workspace?.issue} variant="section" />
            {record === 'tl'
              ? (
                <StructuredList className="evlist" variant="embedded">
                  {sortedRecords.map((ev, index) => {
                    const graphNode = ev.node === undefined
                      ? undefined
                      : displayedGraph.nodes.find((candidate) => candidate.id === ev.node)
                    return (
                      <ProjectEventRow
                        key={`${ev.date} ${index}`}
                        kind={recordKind(ev)} date={ev.date} title={ev.text} detail={ev.detail}
                        origin={recordOrigin(ev)}
                        node={graphNode === undefined
                          ? undefined
                          : { id: graphNode.id, label: graphNode.label, mode: nodeMode(graphNode) }}
                        onSelectNode={goToRecordNode}
                      />
                    )
                  })}
                </StructuredList>
              )
              : (
                <>
                  <ResearchGraph
                    graph={displayedGraph}
                    selected={selectedNode}
                    ideaNodeIds={selectedIdea?.node === undefined ? [] : [selectedIdea.node]}
                    onSelect={(nodeId) => {
                      setSelectedIdeaId(null)
                      setSelectedNode(nodeId)
                    }}
                  />
                </>
              )}
            </div>

            <SectionHeading variant="content">{m.project.linkedIdeas(linkedIdeas.length)}</SectionHeading>
            {linkedIdeas.length === 0
              ? <EmptyState variant="section">{m.project.noLinkedIdeas}</EmptyState>
              : (
                <StructuredList className="project-ideas" variant="embedded">
                  {linkedIdeas.map((idea) => {
                    const source = idea.source.paperTitle === undefined
                      ? idea.source.chatTitle
                      : `${idea.source.paperTitle} · ${idea.source.chatTitle}`
                    const ideaNode = displayedGraph.nodes.find((node) => node.id === idea.node)
                    return (
                      <StructuredRow
                        className={`project-idea-row${selectedIdeaId === idea.id ? ' selected' : ''}`}
                        data-idea={idea.id} key={idea.id}
                        onActivate={() => {
                          setSelectedNode(null)
                          setSelectedIdeaId(idea.id)
                          discardOpenEdits()
                        }}
                      >
                        <span className="project-idea-title">{idea.title}</span>
                        <span className="project-idea-flags">
                          {ideaNode === undefined
                            ? null
                            : (
                              <NodeTag label={ideaNode.label} mode={nodeMode(ideaNode)} />
                            )}
                          {idea.archived ? <span className="project-idea-state">{m.common.archived}</span> : null}
                        </span>
                        <span className="project-idea-source" title={source}>{m.project.idea.sourceTag(source)}</span>
                      </StructuredRow>
                    )
                  })}
                </StructuredList>
              )}

            <ProjectConclusions project={project} onOpenPage={openWikiPage} />

            <ProjectMemo
              text={project.memo} editing={memoEditing} onEditing={setMemoEditing} onOpen={openWikiPage}
              onSave={(memo) => applyWrite(projectApi.update(projectId, { memo }), m.project.remarkSaved)}
            />
          </div>

          <DetailPanel
            open={detailOpen} mode="resize"
            className={`wkside project-detail-panel${detailOpen ? ' node-document-pane' : ''}`}
          >
            {selectedIdea !== undefined
              ? (
                <ProjectIdeaPanel
                  idea={selectedIdea}
                  graph={displayedGraph}
                  workspaceManaged={project.workspace !== undefined}
                  onClose={clearIdea}
                  onOpenIdea={() => jumpTo('ideas', selectedIdea.id)}
                  onCreateNode={() => setIdeaGraphDialog({
                    ideaId: selectedIdea.id, mode: 'create',
                  })}
                  onLinkNode={() => setIdeaGraphDialog({
                    ideaId: selectedIdea.id, mode: 'link',
                  })}
                  onOpenNode={(nodeId) => {
                    onRecord('graph')
                    setSelectedIdeaId(null)
                    setSelectedNode(nodeId)
                  }}
                  onUnlinkNode={() => {
                    void placeIdeaOnGraph(selectedIdea, { kind: 'unlink' })
                  }}
                />
              )
              : node === undefined
              ? (
                <>
                  <SectionHeading variant="rail">{m.project.identity.heading}</SectionHeading>
                  <div className="wkprops">
                    <div className="pk">{m.project.identity.typeLabel}</div>
                    <div className="pv">{m.project.identity.typeValue}</div>
                    <ProjectIdentityFields
                      project={project}
                      fields={{
                        name: (
                          <InlineMetadataField
                            label={m.project.identity.nameFieldLabel} value={project.name}
                            onSave={(name) => {
                              const next = name.trim()
                              if (next === '') { toast(m.project.identity.nameRequired); return false }
                              return writeProject(
                                projectApi.update(projectId, { name: next }), m.project.identity.nameUpdated,
                              )
                            }}
                          />
                        ),
                        status: (
                          <ChoicePicker
                            value={project.status} options={PROJECT_STATUSES}
                            onPick={(status) => applyWrite(
                              projectApi.update(projectId, { status }), m.project.identity.statusUpdated,
                            )}
                          />
                        ),
                        priority: (
                          <PriorityPicker
                            value={project.priority} className="pv metadata-editable"
                            title={m.common.field.clickToEdit}
                            onPick={(priority) => applyWrite(
                              projectApi.update(projectId, { priority }), m.project.identity.priorityUpdated,
                            )}
                          ><ProjectPriorityTag priority={project.priority} /></PriorityPicker>
                        ),
                        topic: (
                          <ProjectTopicField
                            value={project.topic} onError={reportError}
                            onSave={(topic) => writeProject(
                              projectApi.update(projectId, { topic }), m.project.identity.topicUpdated,
                            )}
                          />
                        ),
                      }}
                    />
                    <div className="pk">{m.project.identity.focusLabel[FOCUS_KEY[project.status]]}</div>
                    <InlineMetadataField
                      label={m.project.identity.focusLabel[FOCUS_KEY[project.status]]} value={project.focus}
                      onSave={(focus) => {
                        const next = focus.trim()
                        const label = m.project.identity.focusLabel[FOCUS_KEY[project.status]]
                        if (next === '') { toast(m.project.identity.focusRequired(label)); return false }
                        // When submitting, close the editor that is open elsewhere, and do not wait for the results of this writing; close this box and leave it to
                        // InlineMetadataField, determined by the success or failure of this writing
                        discardOpenEdits()
                        return writeProject(
                          projectApi.update(projectId, { focus: next }), m.project.identity.focusUpdated(label),
                        )
                      }}
                    />
                    <div className="pk">{m.project.control.nextAction}</div>
                    <ProjectNextActionView action={controlState.next} />
                    <div className="pk">{m.project.control.blocker}</div>
                    <InlineMetadataField
                      label={m.project.control.blocker} value={project.block ?? ''}
                      display={<ProjectBlockerView blocker={controlState.blocker} />}
                      onSave={(value) => {
                        const next = value.trim()
                        return writeProject(
                          projectApi.update(projectId, { block: next === '' ? null : next }),
                          next === '' ? m.project.control.blockerCleared : m.project.control.blockerUpdated,
                        )
                      }}
                    />
                    <div className="pk">{m.project.identity.startLabel}</div>
                    <DateButton
                      iso={project.start} className="pv metadata-editable" title={m.common.field.clickToEdit}
                      onPick={(start) => {
                        if (dnum(start) > dnum(project.due)) {
                          toast(m.project.identity.startAfterDue)
                          return
                        }
                        applyWrite(projectApi.update(projectId, { start }), m.project.identity.dateUpdated)
                      }}
                    />
                    <div className="pk">{m.project.identity.dueLabel}</div>
                    <DateButton
                      iso={project.due} className="pv metadata-editable" title={m.common.field.clickToEdit}
                      onPick={(due) => {
                        if (dnum(due) < dnum(project.start)) {
                          toast(m.project.identity.dueBeforeStart)
                          return
                        }
                        applyWrite(projectApi.update(projectId, { due }), m.project.identity.dateUpdated)
                      }}
                    />
                    <div className="pk">{m.project.sections.papers}</div>
                    <div className="pv" title={m.project.identity.paperCountHint}>
                      {m.project.identity.paperCount(project.paperCount)}
                    </div>
                    <div className="pk">{m.project.identity.workspaceLabel}</div>
                    {project.workspace === undefined
                      ? (
                        <button className="pv metadata-editable" onClick={openWorkspace}>
                          {m.project.workspace.connect}
                        </button>
                      )
                      : (
                        <div className="pv workspace-field" title={project.workspace.issue ?? project.workspace.root}>
                          <button
                            className={`workspace-root ${project.workspace.state}`}
                            onClick={openWorkspace}
                          >{workspaceName ?? project.workspace.root}</button>
                          <DotsMenu>
                            <MenuItem onSelect={refreshWorkspace}>{m.project.identity.refreshWorkspace}</MenuItem>
                            <MenuItem onSelect={openWorkspace}>
                              {m.project.identity.changeWorkspace}
                            </MenuItem>
                            <MenuItem
                              className="mi danger"
                              onSelect={() => applyWrite(
                                projectApi.bindWorkspace(projectId, null),
                                m.project.identity.workspaceDisconnected, toast,
                              )}
                            >{m.project.identity.disconnectWorkspace}</MenuItem>
                          </DotsMenu>
                        </div>
                      )}
                  </div>

                  <SectionHeading
                    variant="rail"
                    actions={(
                      // Demo's relAdd guard: If the placeholder is already open, just return the focus to it, and keep half of the filled content.
                      <AddAction
                        variant="section" ref={relAdd} title={m.project.links.addTitle}
                        onClick={() => {
                          if (relAdding) relRow.current?.querySelector('input')?.focus()
                          else setRelAdding(true)
                        }}
                      >{m.project.sections.links}</AddAction>
                    )}
                  >{m.project.sections.links}
                  </SectionHeading>
                  <ProjectRelations
                    groups={project.relations}
                    papers={project.papers.filter((id) => project.paperTitles[id] !== undefined)
                      .map((id) => ({ id, title: project.paperTitles[id]! }))}
                    onOpenPage={openWikiPage}
                    onOpenPaper={(paperId) => jumpTo('reader', paperId)}
                    onRemovePaper={(paperId, title) => applyWrite(
                      projectApi.removePaper(projectId, paperId), m.project.links.paperRemoved(title), toast,
                    )}
                    onMove={(id, index) => { void writeProject(projectApi.moveRelation(projectId, id, index)) }}
                    adding={!relAdding
                      ? undefined
                      : {
                        group: relGroup,
                        row: relRow,
                        onGroup: setRelGroup,
                        input: relGroup === PROJECT_PAPER_GROUP
                          ? (
                            <PickRow
                              key="paper" row={relRow} triggers={relTriggers} allowNew={false}
                              placeholder={m.project.links.paperPlaceholder} suggest={suggestPapers}
                              onNew={() => false}
                              onCancel={stopRel} onError={reportError}
                              onPick={(hit) => writeProject(
                                projectApi.addPaper(projectId, hit.id), m.project.links.paperLinked(hit.title),
                              )}
                            />
                          )
                          : relGroup === PROJECT_URL_GROUP
                            ? (
                              <ProjectUrlDraft
                                key="url" row={relRow} triggers={relTriggers} onCancel={stopRel}
                                onInvalid={() => toast(m.project.links.urlInvalid)}
                                onSubmit={(url, text) => writeProject(projectApi.createRelation(projectId, {
                                  group: PROJECT_URL_GROUP, text, url,
                                }), m.project.links.added)}
                              />
                            )
                          : (
                            <PickRow
                              key="page" row={relRow} triggers={relTriggers} allowNew
                              placeholder={m.project.links.pagePlaceholder} suggest={suggestPages}
                              onCancel={stopRel} onError={reportError}
                              onPick={(hit) => writeProject(projectApi.createRelation(projectId, {
                                group: 'Wiki', text: hit.title, page: hit.id,
                              }), m.project.links.added)}
                              onNew={(text) => writeProject(projectApi.createRelation(projectId, {
                                group: 'Wiki', text,
                              }), m.project.links.added)}
                            />
                          ),
                      }}
                    onRemove={(relationId, text) => applyWrite(
                      projectApi.deleteRelation(projectId, relationId), m.project.links.removed(text), toast,
                    )}
                  />

                  <ProjectAttachments
                    attachments={project.attachments} onAdd={addAttachments}
                    onReveal={(attachment) => (attachment.path === undefined
                      ? toast(m.project.attachments.noPath)
                      : void files.reveal(attachment.path).then((found) => {
                        if (!found) toast(m.project.attachments.missing)
                      }))}
                    onRemove={(attachmentId) => applyWrite(
                      projectApi.deleteAttachment(projectId, attachmentId), m.common.trashed,
                    )}
                  />
                </>
              )
              : (
                <ResearchNodePanel
                  graph={displayedGraph} events={visibleEvents}
                  ideas={linkedIdeas.filter((idea) => idea.node === node.id)} node={node}
                  onClose={clearNode}
                  onSelect={(nodeId) => {
                    setSelectedIdeaId(null)
                    setSelectedNode(nodeId)
                  }}
                  onSelectIdea={(ideaId) => {
                    setSelectedNode(null)
                    setSelectedIdeaId(ideaId)
                  }}
                />
              )}
          </DetailPanel>
        </div>
      </PageBody>
    </PageShell>
  )
}
