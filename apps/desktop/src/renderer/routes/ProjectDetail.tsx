import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  ProjectDetail as Project, ProjectWorkspace, RelationGroup, ResearchGraph as ResearchGraphData, ResearchIdea,
  ProjectFields, ProjectRecordedChange, ResearchIdeaGraphPlacement, TaskWindow,
} from '../../shared/contract.js'
import { projectControlState } from '../../shared/project-control.js'
import { researchPathState } from '../../shared/research-path.js'
import { withTaskNodes } from '../../shared/task-nodes.js'
import {
  FOCUS_KEY, projectAreas, projectDecisionItems, recordKind, recordOrigin, sortRecordsNewestFirst,
} from '../../shared/project-signals.js'
import { PROJECT_STATUSES } from '../../shared/vocabulary.js'
import { appMenu, files, idea as ideaApi, papers, project as projectApi, wiki } from '../ipc.js'
import {
  useCrumbTail, useEscapeLayer, useJump, useNotice, useToday, useVaultRevision,
} from '../shell/AppShell.js'
import { ActionButton } from '../components/ActionButton.js'
import { AddAction } from '../components/AddAction.js'
import { DraftForm, DraftLine } from '../components/DraftForm.js'
import { MenuItem } from '../components/ActionMenu.js'
import { EmptyState } from '../components/EmptyState.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { DetailPanel } from '../components/DetailPanel.js'
import { ChoicePicker, DateButton, DotsMenu, PriorityPicker } from '../components/FieldPickers.js'
import { IconButton } from '../components/IconButton.js'
import { IconOpen } from '../components/icons.js'
import { SegmentedControl } from '../components/SegmentedControl.js'
import { TabbedSection } from '../components/TabbedSection.js'
import { RowActions, StructuredList, StructuredRow } from '../components/StructuredList.js'
import { TitleNote } from '../components/TitleNote.js'
import {
  ProjectAttention, ProjectEventList, ProjectEventRow,
} from '../components/project/ProjectSignals.js'
import {
  ProjectBlockerView, ProjectNextActionView,
} from '../components/project/ProjectControl.js'
import { ProjectIdentityFields, ProjectPriorityTag } from '../components/project/ProjectIdentity.js'
import {
  attachmentSizeText, PROJECT_PAPER_GROUP, PROJECT_RELATION_GROUPS, PROJECT_URL_GROUP, ProjectAgentSessions,
  ProjectAreasField, ProjectAttachments, ProjectMemo, ProjectRelations, ProjectUrlDraft,
} from '../components/project/ProjectSections.js'
import { NodeAssignment } from '../components/project/NodeAssignment.js'
import { EntityLink } from '../components/EntityLink.js'
import { ProjectConclusionPanel, ProjectConclusionRow } from '../components/project/ProjectConclusions.js'
import { ProjectTimeline } from '../components/project/ProjectTimeline.js'
import { nodeMode, ResearchGraph, ResearchNodePanel } from '../components/project/ResearchGraph.js'
import { IdeaPanel, IdeaSource, ideaSourceLabel, ownIdea, SourceChatDeleted } from '../components/ideas/IdeaPanel.js'
import { IdeaDraft, type IdeaDraftText } from '../components/ideas/IdeaDraft.js'
import { ProjectPlan, ProjectTaskPanel } from '../components/project/ProjectPlan.js'
import type { PlanCreating, PlanTab } from '../components/project/ProjectPlan.js'
import { BackButton } from '../components/BackButton.js'
import { dnum } from '../../shared/dates.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import { InlineMetadataField } from '../components/InlineField.js'
import { ModalDialog } from '../components/ModalDialog.js'
import { DirectoryField, FormInput } from '../components/FormControls.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { PickRow, type PickHit } from '../components/PickRow.js'
import { plainTitle } from '../components/paper/paper-text.js'
import { StatusDot } from '../components/StatusDot.js'
import { Tag } from '../components/Tag.js'
import { Tooltip } from '../components/Tooltip.js'
import { editText, useDraft, useDrafts, usePruneDrafts, type EditDraft } from '../hooks/useDrafts.js'
import { NO_TRIGGERS } from '../hooks/useOnLeave.js'
import { useScreenLoad } from '../hooks/useScreenLoad.js'
import { useScreenPoll } from '../hooks/useScreenPoll.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { useSourceChatDeleted } from '../hooks/useSourceChatDeleted.js'
import { FadeText } from '../components/FadeText.js'
import './shell.css'
import './ProjectDetail.css'

/** The Research log's three views: activity, conclusions, and the research graph. */
export type RecordTab = 'tl' | 'concl' | 'graph'

/**
 * The bound workspace's name as the button that changes the connection, after a dot that names the
 * connection's state: in words when the workspace cannot be reached, as its tooltip when it is connected.
 * The name's tooltip is the workspace's `root`.
 */
export function WorkspaceRoot({ state, name, root, onOpen }: {
  state: ProjectWorkspace['state']
  name: string
  root: string
  onOpen: () => void
}) {
  const m = useMessages()
  return (
    <button className="workspace-root" onClick={onOpen}>
      <StatusDot
        tone={state === 'ready' ? 'good' : 'bad'} label={m.project.workspace.state[state]} labelHidden={state === 'ready'}
      />
      <Tooltip label={root} whenClipped={name === root}><FadeText className="workspace-name">{name}</FadeText></Tooltip>
    </button>
  )
}

/**
 * A linked idea in the project's detail panel. Its research-node section links a node of `graph`, or,
 * unless the workspace manages the graph, drafts a new node in place, titled as the idea and after a
 * node or as a root, which `onCreateNode` creates and links, resolving whether it did. A `related`
 * idea, one that relates to the project but is not carried out in it, has no research-node section.
 * `sourceChatDeleted` says the chat the idea came from is deleted.
 */
export function ProjectIdeaPanel({
  idea, graph, workspaceManaged, related = false, sourceChatDeleted = false,
  onClose, onOpenIdea, onOpenPaper, onCreateNode, onOpenNode, onSetNode,
}: {
  idea: ResearchIdea
  graph: ResearchGraphData
  workspaceManaged: boolean
  related?: boolean
  sourceChatDeleted?: boolean
  onClose: () => void
  onOpenIdea: () => void
  onOpenPaper: (paperId: string) => void
  onCreateNode: (label: string, after: string | null) => Promise<boolean>
  onOpenNode: (nodeId: string) => void
  onSetNode: (nodeId: string | null) => void
}) {
  const m = useMessages()
  const g = m.ideas.nodeDraft
  const linkedNode = graph.nodes.find((node) => node.id === idea.node)
  // A node draft belongs to the idea it was opened for and shows only with it.
  const [draft, setDraft] = useDraft<{ label: string; after: string }>(['idea', idea.id], 'node')
  const draftAt = useRef<HTMLDivElement>(null)
  const startNode = () => {
    if (draft === null) setDraft({ label: idea.title, after: '' })
    else draftAt.current?.querySelector<HTMLElement>('.form-control')?.focus()
  }
  return (
    <IdeaPanel
      idea={idea} onClose={onClose} onOpenSourcePaper={onOpenPaper} sourceChatDeleted={sourceChatDeleted}
      actions={(
        <IconButton label={m.project.idea.openIdea} className="project-idea-open-idea" onClick={onOpenIdea}>
          <IconOpen />
        </IconButton>
      )}
    >
      {related ? null : (
        <NodeAssignment
          node={linkedNode === undefined ? undefined : { id: linkedNode.id, label: linkedNode.label, mode: nodeMode(linkedNode) }}
          nodes={graph.nodes} canUnlink onOpen={onOpenNode} onSet={onSetNode}
          create={workspaceManaged ? undefined : <button className="btn sm" onClick={startNode}>{m.project.idea.createNode}</button>}
          draft={draft === null ? undefined : (
            <div ref={draftAt}>
              <DraftForm
                canSave={draft.label.trim() !== ''} onCancel={() => setDraft(null)}
                onSave={() => onCreateNode(draft.label.trim(), draft.after === '' ? null : draft.after)
                  .then((created) => { if (created) setDraft(null) })}
              >
                {(invalid) => (
                  <>
                    <FormInput
                      value={draft.label} maxLength={160} aria-label={g.nodeTitleLabel}
                      aria-invalid={invalid(draft.label.trim() === '')}
                      onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                    />
                    <DraftLine label={g.afterLabel}>
                      <ChoicePicker
                        appearance="field" aria-label={g.afterLabel} value={draft.after}
                        options={['', ...graph.nodes.map((node) => node.id)]}
                        label={(id) => (id === '' ? g.newRootOption : graph.nodes.find((node) => node.id === id)?.label ?? id)}
                        onPick={(after) => setDraft({ ...draft, after })}
                      />
                    </DraftLine>
                  </>
                )}
              </DraftForm>
            </div>
          )}
        />
      )}
    </IdeaPanel>
  )
}

/** Newest first, by creation day, then by id, which later ideas take higher numbers in. */
const newestFirst = (a: ResearchIdea, b: ResearchIdea) =>
  b.created.localeCompare(a.created) || b.id.localeCompare(a.id, undefined, { numeric: true })

/**
 * The ideas section of a project page, each idea once and in the first group it belongs to: the ideas
 * carried out in project `projectId`, then the ones related to it, tagged as related, then the ones
 * sparked in it, tagged with their source; newest first within each group. `ideas` is null until they
 * are read: a loading placeholder, or `error`, why reading them failed. A carried-out idea shows its node in `graph`. Activating a row selects that idea through
 * `onSelect`. The heading's new-idea action drafts an idea sparked in the project first in that last
 * group, where it lands; `onCreate` writes it and settles whether it was written. An idea for which
 * `chatDeleted` holds carries the tag saying the chat it came from is deleted.
 */
export function ProjectIdeaList({ projectId, ideas, error, graph, selectedId, onSelect, onCreate, chatDeleted = () => false }: {
  projectId: string
  ideas: readonly ResearchIdea[] | null
  error: string | null
  graph: ResearchGraphData
  selectedId: string | null
  onSelect: (ideaId: string) => void
  onCreate: (title: string, body: string) => Promise<boolean>
  chatDeleted?: (idea: ResearchIdea) => boolean
}) {
  const m = useMessages()
  const [draft, setDraft] = useDraft<IdeaDraftText>(['project', projectId], 'idea')
  const draftAt = useRef<HTMLDivElement>(null)
  const add = useRef<HTMLButtonElement>(null)
  const triggers = useMemo(() => [add], [])
  const carried = (ideas ?? []).filter((idea) => idea.project === projectId)
  const related = (ideas ?? []).filter((idea) => idea.project !== projectId && idea.relations?.projects.includes(projectId) === true)
  const sparked = (ideas ?? []).filter((idea) => !carried.includes(idea) && !related.includes(idea) && idea.sourceProject === projectId)
  const row = (idea: ResearchIdea, tag: string | null) => {
    const source = ideaSourceLabel(idea)
    const ideaNode = tag === null ? graph.nodes.find((node) => node.id === idea.node) : undefined
    return (
      <StructuredRow
        className="project-idea-row" selected={selectedId === idea.id}
        data-idea={idea.id} key={idea.id} onActivate={() => onSelect(idea.id)}
      >
        <FadeText className="project-idea-title" label={idea.title}>{idea.title}</FadeText>
        <span className="project-idea-flags">
          {ideaNode === undefined
            ? null
            : (
              <EntityLink kind="node" label={ideaNode.label} mode={nodeMode(ideaNode)} />
            )}
          {tag === null ? null : <Tag>{tag}</Tag>}
          {idea.archived ? <Tag>{m.common.archived}</Tag> : null}
          {chatDeleted(idea) ? <SourceChatDeleted /> : null}
        </span>
        {ownIdea(idea) ? null : (
          <FadeText className="project-idea-source" label={m.project.idea.sourceTag(source)}>
            <IdeaSource idea={idea} message={m.project.idea.sourceTag} />
          </FadeText>
        )}
      </StructuredRow>
    )
  }
  const shown = carried.length + related.length + sparked.length
  return (
    <>
      <SectionHeading
        actions={(
          <AddAction
            variant="section" ref={add} label={m.ideas.create}
            onClick={() => {
              // An open draft is only refocused, keeping what is typed.
              if (draft !== null) draftAt.current?.querySelector<HTMLElement>('.form-control')?.focus()
              else setDraft({ title: '', body: '' })
            }}
          >{m.project.idea.kind}</AddAction>
        )}
      >{m.project.linkedIdeas(shown)}
      </SectionHeading>
      {ideas === null
        ? (error === null ? <LoadingPlaceholder shape="rows" count={2} /> : <PageError variant="section" error={error} />)
        : shown === 0 && draft === null
        ? <EmptyState variant="section">{m.project.noLinkedIdeas}</EmptyState>
        : (
          <StructuredList className="project-ideas" variant="embedded">
            {[...carried].sort(newestFirst).map((idea) => row(idea, null))}
            {[...related].sort(newestFirst).map((idea) => row(idea, m.project.sections.links))}
            {draft === null ? null : (
              <StructuredRow className="project-idea-draft" rowRef={draftAt}>
                <IdeaDraft
                  draft={draft} triggers={triggers} onChange={setDraft} onCancel={() => setDraft(null)}
                  onSave={(title, body) => onCreate(title, body).then((created) => { if (created) setDraft(null) })}
                />
              </StructuredRow>
            )}
            {[...sparked].sort(newestFirst).map((idea) => row(idea, m.project.sections.source))}
          </StructuredList>
        )}
    </>
  )
}

/**
 * Project details: the Gantt timeline, the task and milestone list, the Research log, and the
 * properties panel on the right. `projectId` is the project shown; its data comes from project.get.
 * Tasks and milestones are created, changed and deleted through project.createTask / updateTask /
 * deleteTask and the matching milestone methods; project properties are written back to Core through
 * project.update. `onBack` goes on the breadcrumbs' "Projects" segment and returns to the project
 * list; it must keep the same reference across re-renders. `onReturn` goes on the Back button in the
 * content's navigation row and returns to the screen the user came from, or to the project list.
 * The selected tab of both tab groups is held by the caller (the demo's projPlanTab / projTab are
 * module-level variables), so leaving the project and coming back lands on the last tab; `onTab` and
 * `onRecord` must keep the same reference too.
 */
export function ProjectDetail({
  projectId, onBack, onReturn, tab, onTab, record, onRecord, arrivalTask = null, arrivalMilestone = null,
  arrivalConclusion = null, onArrived,
}: {
  projectId: string
  onBack: () => void
  /** Back through history: to the screen that jumped here, or to the list when entered from the project list. */
  onReturn: () => void
  tab: PlanTab
  onTab: (tab: PlanTab) => void
  record: RecordTab
  onRecord: (record: RecordTab) => void
  /** A task to locate once the project has loaded, as when the overview timeline opens it. */
  arrivalTask?: string | null
  /** A milestone to locate once the project has loaded, as when an overview decision opens it. */
  arrivalMilestone?: string | null
  /** A conclusion to open once the project has loaded, as when the Wiki review queue asks to verify it. */
  arrivalConclusion?: string | null
  onArrived?: () => void
}) {
  const fmt = useFormat()
  const m = useMessages()
  const railFade = useScrollFade('y')
  const [project, setProject] = useState<Project | null>(null)
  const [linkedIdeas, setLinkedIdeas] = useState<ResearchIdea[] | null>(null)
  const [relAdding, setRelAdding] = useState(false)
  const [relGroup, setRelGroup] = useState<string>(PROJECT_RELATION_GROUPS[0])
  const [relEditing, setRelEditing] = useState<RelationGroup['items'][number] | null>(null)
  const [creating, setCreating] = useState<PlanCreating | null>(null)
  // A new object on every locate: clicking the same row again changes its identity, so the effect below reruns.
  const [flash, setFlash] = useState<{ id: string } | null>(null)
  const [hoverMilestone, setHoverMilestone] = useState<string | null>(null)
  const edits = useDrafts<EditDraft>(['project', projectId])
  const shownProject = project?.id === projectId ? project : null
  usePruneDrafts(['project', projectId, 'task'], shownProject === null ? null : shownProject.tasks.map((task) => task.id))
  usePruneDrafts(['project', projectId, 'conclusion'], shownProject === null ? null
    : (shownProject.projectConclusions ?? []).map((conclusion) => conclusion.id))
  usePruneDrafts(['project', projectId, 'milestone'], shownProject === null ? null
    : ['new', ...shownProject.milestones.map((milestone) => milestone.id)])
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedConclusion, setSelectedConclusion] = useState<string | null>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaceMode, setWorkspaceMode] = useState<'local' | 'ssh'>('local')
  const [localPath, setLocalPath] = useState('')
  const [sshHost, setSshHost] = useState('')
  const [sshPath, setSshPath] = useState('')
  const [sshPort, setSshPort] = useState('')
  const [binding, setBinding] = useState<'local' | 'ssh' | null>(null)
  const planList = useRef<HTMLDivElement>(null)
  const planAdd = useRef<HTMLButtonElement>(null)
  const ganttAdd = useRef<HTMLButtonElement>(null)
  const relRow = useRef<HTMLDivElement>(null)
  const relAdd = useRef<HTMLButtonElement>(null)
  const relTriggers = useMemo(() => [relAdd], [])
  const relEditRow = useRef<HTMLDivElement>(null)

  const stopRel = useCallback(() => {
    setRelAdding(false)
  }, [])
  const stopRelEdit = useCallback(() => setRelEditing(null), [])
  const notice = useNotice()
  const today = useToday()
  const clearNode = useCallback(() => setSelectedNode(null), [])
  const clearIdea = useCallback(() => setSelectedIdeaId(null), [])
  const clearTask = useCallback(() => setSelectedTaskId(null), [])
  const clearConclusion = useCallback(() => setSelectedConclusion(null), [])
  /** The task panel shares the right-side slot with the node/idea/conclusion panels: opening a task
   * is the only place that sets it, so every other opener needs no change of its own to give it up
   * -- the effect below clears it back out whenever one of those three becomes selected instead. */
  const openTask = useCallback((taskId: string) => {
    setSelectedNode(null)
    setSelectedIdeaId(null)
    setSelectedConclusion(null)
    setSelectedTaskId(taskId)
  }, [])
  const { revision } = useVaultRevision()
  const chatDeleted = useSourceChatDeleted()
  const { open: jumpTo } = useJump()
  const openWikiPage = (page: string) => jumpTo('wiki', page)
  const { error, failure, load, report } = useScreenLoad(['ideas'])
  const write = useVaultWrite()
  const undo = useUndo()
  const heldPapers = project?.papers
  const suggestPapers = useCallback(async (query: string): Promise<PickHit[]> => {
    if (query === '') return []
    const { rows } = await papers.list({ page: 1, size: 8, filter: query })
    return rows
      .filter((row) => !(heldPapers ?? []).includes(row.id))
      .map((row) => ({
        id: row.id,
        title: row.title,
        paper: true,
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

  // Writes outside this screen can change this project too (restoring an attachment from the Trash),
  // so fetch again on every revision.
  useEffect(() => load('project', projectApi.get(projectId), setProject), [projectId, load, revision])

  // An idea stores the project it is carried out in, the projects it relates to and the one it was
  // sparked in; project details look all three up from this side, so they show at both ends.
  useEffect(() => load('ideas', ideaApi.list(), (ideas) => setLinkedIdeas(ideas.filter((idea) => idea.project === projectId
    || idea.relations?.projects.includes(projectId) === true || idea.sourceProject === projectId))), [projectId, load, revision])

  // While project details are open, follow what external writers put in the workspace; SSH needs a
  // process and a network connection, so it polls less often than a local folder.
  const workspaceKey = project?.workspace === undefined
    ? undefined
    : [project.workspace.kind, project.workspace.host, project.workspace.port, project.workspace.root].join(':')
  const workspaceKind = project?.workspace?.kind
  useScreenPoll(
    load, 'project', () => projectApi.get(projectId), setProject,
    workspaceKey === undefined ? null : workspaceKind === 'ssh' ? 15_000 : 2000,
  )

  useEffect(() => {
    setSelectedNode(null)
    setSelectedIdeaId(null)
    setSelectedTaskId(null)
    setSelectedConclusion(null)
  }, [projectId])

  useEffect(() => {
    if (selectedIdeaId !== null && linkedIdeas !== null && !linkedIdeas.some((idea) => idea.id === selectedIdeaId)) {
      setSelectedIdeaId(null)
    }
  }, [linkedIdeas, selectedIdeaId])

  // The task panel shares its slot with the node/idea/conclusion panels; opening any of those closes it.
  useEffect(() => {
    if (selectedNode !== null || selectedIdeaId !== null || selectedConclusion !== null) setSelectedTaskId(null)
  }, [selectedNode, selectedIdeaId, selectedConclusion])

  useEscapeLayer(selectedNode !== null, clearNode)
  useEscapeLayer(selectedIdeaId !== null, clearIdea)
  useEscapeLayer(selectedTaskId !== null, clearTask)
  useEscapeLayer(selectedConclusion !== null, clearConclusion)

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
  }, [selectedNode, selectedIdeaId, selectedConclusion])

  useEffect(() => {
    if (!flash) return
    const row = planList.current?.querySelector<HTMLElement>(`[data-row="${flash.id}"]`)
    if (row) {
      row.scrollIntoView({ block: 'nearest' })
      // The row's class does not change: without clearing the animation and forcing a layout, locating
      // the same row a second time would not replay the flash.
      row.style.animation = 'none'
      row.getBoundingClientRect()
      row.style.animation = ''
    }
    const timer = window.setTimeout(() => setFlash(null), 1200)
    return () => window.clearTimeout(timer)
  }, [flash])

  /**
   * Discards the open new row, the Links add and edit rows and the Project notes editor. The demo's
   * renderProject rewrote the whole deskBody, losing any rows and forms inserted in it, and rebuilt
   * the notes box from the source text.
   */
  const discardOpenEdits = useCallback(() => {
    setCreating(null)
    stopRel()
    stopRelEdit()
    edits.drop('memo')
  }, [stopRel, stopRelEdit, edits])

  /**
   * Finishes a write that returns the project: the project goes into state, then `write` bumps the
   * vault revision and, when `note` is given, shows it as a success notice. A failed write is
   * reported and returns false. Placeholder submissions come straight
   * here: the placeholder closes or stays open by itself depending on the result, so nothing is lost.
   */
  const writeProject = (op: Promise<Project>, note?: ReactNode): Promise<boolean> =>
    write(op.then((p) => setProject(p)), { note })

  /**
   * A write not made from a placeholder: first discards any open editor, as the demo's renderProject
   * rewrote the whole deskBody.
   */
  const applyWrite = (op: Promise<Project>, note?: ReactNode) => {
    discardOpenEdits()
    void writeProject(op, note)
  }

  /**
   * Finishes a removal the change log records as writeProject finishes a write, and its notice also
   * offers Undo of the change it recorded.
   */
  const writeRemoval = (op: Promise<ProjectRecordedChange>, note: ReactNode): Promise<boolean> =>
    write(op.then((removed) => {
      setProject(removed.project)
      return removed
    }), { note, action: undo.change })

  /** A removal not made from a placeholder: first discards any open editor, as applyWrite does. */
  const applyRemoval = (op: Promise<ProjectRecordedChange>, note: ReactNode) => {
    discardOpenEdits()
    void writeRemoval(op, note)
  }

  /** Writes `patch` to this project through project.update and answers the project after the write. */
  const updateProject = (patch: Partial<ProjectFields>): Promise<Project> =>
    projectApi.update(projectId, patch).then(({ project: updated }) => updated)

  /** Persists a drag-reordering of the task list, shared by the plan's task rows and the Gantt's labels. */
  const reorderTasks = (order: string[]) => { void writeProject(projectApi.reorderTasks(projectId, order)) }

  const chooseLocalWorkspace = async () => {
    const root = await appMenu.chooseWorkspaceRoot()
    if (root !== null) setLocalPath(root)
  }

  const connectLocalWorkspace = async () => {
    setBinding('local')
    const connected = await writeProject(
      projectApi.bindWorkspace(projectId, { kind: 'local', root: localPath.trim() }),
      m.project.workspace.connected,
    )
    setBinding(null)
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
    setBinding('ssh')
    const connected = await writeProject(projectApi.bindWorkspace(projectId, {
      kind: 'ssh', host: sshHost.trim(), path: sshPath.trim(),
      ...(port === undefined ? {} : { port }),
    }), m.project.workspace.sshConnected)
    setBinding(null)
    if (connected) setWorkspaceOpen(false)
  }

  const refreshWorkspace = () => {
    load('project', projectApi.get(projectId), setProject)
  }

  const locatePlanRow = useCallback((kind: PlanTab, id: string) => {
    if (tab !== kind) {
      onTab(kind)
      discardOpenEdits()
    }
    setFlash({ id })
  }, [tab, onTab, discardOpenEdits])
  const locateTask = useCallback((taskId: string) => {
    locatePlanRow('task', taskId)
    openTask(taskId)
  }, [locatePlanRow, openTask])

  useEffect(() => {
    if (arrivalTask === null || project?.id !== projectId) return
    locateTask(arrivalTask)
    onArrived?.()
  }, [arrivalTask, project, projectId, locateTask, onArrived])

  useEffect(() => {
    if (arrivalMilestone === null || project?.id !== projectId) return
    locatePlanRow('ms', arrivalMilestone)
    onArrived?.()
  }, [arrivalMilestone, project, projectId, locatePlanRow, onArrived])

  useEffect(() => {
    if (arrivalConclusion === null || project?.id !== projectId) return
    setSelectedNode(null)
    setSelectedIdeaId(null)
    setSelectedConclusion(arrivalConclusion)
    onArrived?.()
  }, [arrivalConclusion, project, projectId, onArrived])

  if (!project) {
    return (
      <PageShell>
        <PageHeader>
          <BackButton onClick={onReturn} />
          <PageTitle>{m.project.loadingTitle}</PageTitle>
        </PageHeader>
        <PageError error={error} />
        <PageBody>{error === null ? <LoadingPlaceholder shape="lines" count={6} /> : null}</PageBody>
      </PageShell>
    )
  }

  /** Which plan tab the new row belongs to; null when there is no new row. */
  const openRowKind: PlanTab | null = creating?.kind ?? null

  /** When that tab already has a new row, moves focus back to it instead of opening a second one. */
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

  /**
   * Adds the dropped or chosen local files as attachments, one after another. Only the absolute path
   * is recorded; the file itself is not copied.
   */
  const addAttachments = (dropped: File[]) => {
    const local = dropped.filter((file) => files.pathOf(file) !== '')
    if (local.length < dropped.length) notice.refusal(m.project.attachments.localOnly)
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
  const taskGraph = withTaskNodes(displayedGraph, project.taskNodes)
  const visibleEvents = [...project.events, ...(project.workspace?.events ?? [])]
  const sortedRecords = sortRecordsNewestFirst(visibleEvents)
  const goToRecordNode = (nodeId: string) => {
    holdRecordHeading()
    onRecord('graph')
    setSelectedIdeaId(null)
    setSelectedConclusion(null)
    setSelectedNode(nodeId)
    discardOpenEdits()
  }
  const attn = projectDecisionItems({
    status: project.status,
    // Old project conclusions are kept only for data compatibility and no longer feed the project page's signals.
    conclusions: { conflicting: 0 },
    milestones: project.milestones,
    lastProgress: project.lastProgress,
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
  const node = taskGraph.nodes.find((n) => n.id === selectedNode)
  const selectedIdea = linkedIdeas?.find((idea) => idea.id === selectedIdeaId)
  const selectedTask = project.tasks.find((t) => t.id === selectedTaskId)
  const conclusions = project.projectConclusions ?? []
  const conclusion = conclusions.find((candidate) => candidate.id === selectedConclusion)
  const nodeLook = (nodeId: string | undefined) => {
    const found = displayedGraph.nodes.find((candidate) => candidate.id === nodeId)
    return found === undefined ? undefined : { id: found.id, label: found.label, mode: nodeMode(found) }
  }
  const detailOpen = node !== undefined || selectedIdea !== undefined
    || selectedTask !== undefined || conclusion !== undefined
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
        if (result.project !== null) setProject(result.project)
        setLinkedIdeas((held) => held?.map((candidate) => (
          candidate.id === result.idea.id ? result.idea : candidate
        )) ?? null)
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
        open={workspaceOpen} onOpenChange={setWorkspaceOpen} size="form" className="workspace-dialog"
        title={m.project.workspace.dialogTitle}
        actions={(
          <>
            <button type="button" className="btn" onClick={() => setWorkspaceOpen(false)}>{m.common.cancel}</button>
            {workspaceMode === 'local'
              ? (
                <ActionButton
                  type="submit" form="workspaceLocal" className="workspace-local btn pri" disabled={binding !== null}
                  busy={binding === 'local'} busyLabel={m.project.workspace.adding}
                >{m.project.workspace.add}</ActionButton>
              )
              : (
                <ActionButton
                  type="submit" form="workspaceSsh" className="btn pri" disabled={binding !== null}
                  busy={binding === 'ssh'} busyLabel={m.project.workspace.connecting}
                >{m.project.workspace.connect}</ActionButton>
              )}
          </>
        )}
      >
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
                  id="workspaceLocal" className="workspace-form"
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
                </form>
              )
              : (
                <form
                  id="workspaceSsh" className="workspace-form"
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
                </form>
              )}
      </ModalDialog>

      <PageBody className="project-detail-body">
        <ProjectTimeline
          project={project} hoverMilestone={hoverMilestone} onHoverMilestone={setHoverMilestone}
          onLocateTask={locateTask}
          onMoveTask={(taskId, start, end, days) => applyWrite(
            projectApi.updateTask(projectId, taskId, { start, end }),
            m.project.plan.taskMoved(days),
          )}
          onMoveTaskWindow={(taskId, patch, slots) => applyWrite(
            projectApi.updateTask(projectId, taskId, patch),
            m.project.plan.taskWindowMoved(slots),
          )}
          onMoveMilestone={(milestoneId, date) => applyWrite(
            projectApi.updateMilestone(projectId, milestoneId, { date }),
            m.project.plan.rescheduledTo(fmt.date(date)),
          )}
          onReorderTasks={reorderTasks}
          onNewTask={startTask} onNewMilestone={startMilestone}
          onCreateMilestone={(date, title) => writeProject(
            projectApi.createMilestone(projectId, { date, title, done: false }), m.project.plan.milestoneCreated,
          )}
          onUpdateMilestone={(milestoneId, patch) => writeProject(
            projectApi.updateMilestone(projectId, milestoneId, patch), m.project.plan.milestoneUpdated,
          )}
          onDeleteMilestone={(milestoneId) => applyRemoval(
            projectApi.deleteMilestone(projectId, milestoneId), m.project.plan.milestoneDeleted,
          )}
          newActionRef={ganttAdd}
        />

        {attn.length > 0
          ? (
            <>
              <SectionHeading>{m.project.signals.heading(attn.length)}</SectionHeading>
              <ProjectAttention
                items={attn} onOpenPage={openWikiPage} onLocateTask={locateTask}
                onLocateMilestone={(milestoneId) => locatePlanRow('ms', milestoneId)}
              />
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
              flashId={flash?.id ?? null} selectedTaskId={selectedTaskId}
              listRef={planList} addRef={planAdd} timelineAddRef={ganttAdd}
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
              onDeleteTask={(taskId) => applyRemoval(
                projectApi.deleteTask(projectId, taskId), m.project.plan.taskDeleted,
              )}
              onReorderTasks={reorderTasks}
              onOpenTask={openTask}
              onUpdateMilestone={(milestoneId, patch) => writeProject(
                projectApi.updateMilestone(projectId, milestoneId, patch), m.project.plan.milestoneUpdated,
              )}
              onDeleteMilestone={(milestoneId) => applyRemoval(
                projectApi.deleteMilestone(projectId, milestoneId), m.project.plan.milestoneDeleted,
              )}
            />

            <TabbedSection
              heading={m.project.sections.records} label={m.project.recordViewLabel} value={record}
              headingRef={recordHeading} panelClassName="record-view" error={project.workspace?.issue}
              onChange={(value) => {
                holdRecordHeading()
                onRecord(value)
                if (value !== 'graph') setSelectedNode(null)
                if (value !== 'concl') setSelectedConclusion(null)
                discardOpenEdits()
              }}
              tabs={[
                {
                  value: 'tl', label: m.project.recordModes.activity, empty: m.project.graph.noRecords,
                  content: sortedRecords.length === 0 ? null : (
                    <ProjectEventList withNode className="evlist">
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
                    </ProjectEventList>
                  ),
                },
                {
                  value: 'concl', label: m.project.recordModes.conclusions, empty: m.project.conclusions.empty,
                  content: conclusions.length === 0 ? null : (
                    <ProjectEventList withNode className="evlist">
                      {conclusions.map((item) => (
                        <ProjectConclusionRow
                          key={item.id} conclusion={item} node={nodeLook(item.node)}
                          selected={item.id === selectedConclusion}
                          onOpen={() => {
                            setSelectedNode(null)
                            setSelectedIdeaId(null)
                            setSelectedConclusion(item.id)
                            discardOpenEdits()
                          }}
                        />
                      ))}
                    </ProjectEventList>
                  ),
                },
                {
                  value: 'graph', label: m.project.sections.graph, empty: m.project.graph.empty,
                  content: displayedGraph.nodes.length === 0 ? null : (
                    <ResearchGraph
                      graph={displayedGraph}
                      selected={selectedNode}
                      ideaNodeIds={selectedIdea?.node === undefined || selectedIdea.project !== projectId ? [] : [selectedIdea.node]}
                      onSelect={(nodeId) => {
                        setSelectedIdeaId(null)
                        setSelectedConclusion(null)
                        setSelectedNode(nodeId)
                      }}
                    />
                  ),
                },
              ]}
            />

            <ProjectIdeaList
              projectId={projectId} ideas={linkedIdeas} error={failure('ideas')} graph={displayedGraph} selectedId={selectedIdeaId} chatDeleted={chatDeleted}
              onCreate={(title, body) => write(ideaApi.create(undefined, title, body, projectId).then((idea) => {
                setLinkedIdeas((held) => [idea, ...(held ?? [])])
              }), { note: m.chat.ideaSavedNote })}
              onSelect={(ideaId) => {
                setSelectedNode(null)
                setSelectedConclusion(null)
                setSelectedIdeaId(ideaId)
                discardOpenEdits()
              }}
            />

            <ProjectMemo
              edit={editText(edits, 'memo', project.memo)} onOpen={openWikiPage}
              onSave={(memo) => applyWrite(updateProject({ memo }), m.project.remarkSaved)}
            />
          </div>

          <DetailPanel
            open={detailOpen} mode="resize" ref={railFade} data-fade-paint=""
            className={`wkside project-detail-panel${detailOpen ? ' node-document-pane' : ''}`}
          >
            {selectedTask !== undefined
              ? (
                <ProjectTaskPanel
                  projectId={projectId} task={selectedTask} onClose={clearTask} onOpenNode={goToRecordNode}
                  node={nodeLook(taskGraph.nodes.find((candidate) => candidate.tasks?.includes(selectedTask.id))?.id)}
                  nodes={displayedGraph.nodes}
                  handSet={displayedGraph.nodes.some((candidate) => candidate.id === project.taskNodes?.[selectedTask.id])}
                  onSaveNote={(note) => writeProject(
                    projectApi.updateTask(projectId, selectedTask.id, { note }), m.project.plan.noteUpdated,
                  )}
                  onSetNode={(nodeId) => {
                    void writeProject(projectApi.setTaskNode(projectId, selectedTask.id, nodeId), m.project.plan.nodeUpdated)
                  }}
                />
              )
              : selectedIdea !== undefined
              ? (
                <ProjectIdeaPanel
                  idea={selectedIdea}
                  graph={displayedGraph}
                  workspaceManaged={project.workspace !== undefined}
                  related={selectedIdea.project !== projectId} sourceChatDeleted={chatDeleted(selectedIdea)}
                  onClose={clearIdea}
                  onOpenIdea={() => jumpTo('ideas', selectedIdea.id)}
                  onOpenPaper={(paperId) => jumpTo('reader', paperId)}
                  onCreateNode={(label, after) => placeIdeaOnGraph(selectedIdea, { kind: 'create', label, after })}
                  onOpenNode={(nodeId) => {
                    onRecord('graph')
                    setSelectedIdeaId(null)
                    setSelectedNode(nodeId)
                  }}
                  onSetNode={(nodeId) => {
                    void placeIdeaOnGraph(selectedIdea, nodeId === null ? { kind: 'unlink' } : { kind: 'link', nodeId })
                  }}
                />
              )
              : conclusion !== undefined
              ? (
                <ProjectConclusionPanel
                  projectId={projectId} projectName={project.name} conclusion={conclusion} node={nodeLook(conclusion.node)}
                  onClose={clearConclusion}
                  onVerify={(verified, fingerprint) => {
                    void writeProject(
                      projectApi.verifyConclusion(projectId, verified, fingerprint), m.project.conclusions.verified,
                    ).then((saved) => { if (!saved) refreshWorkspace() })
                  }}
                  onUnverify={(verified) => {
                    void writeProject(
                      projectApi.unverifyConclusion(projectId, verified), m.project.conclusions.unverified,
                    )
                  }}
                  onWrite={(page, title, ops) => write(wiki.apply({ source: 'user', title, ops }), {
                    note: m.project.conclusions.written,
                    action: () => ({ label: m.common.open, onAction: () => openWikiPage(page) }),
                  })}
                  onOpenNode={goToRecordNode}
                  onOpenTask={locateTask}
                  onOpenPage={openWikiPage}
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
                              if (next === '') { notice.refusal(m.project.identity.nameRequired); return false }
                              return writeProject(
                                updateProject({ name: next }), m.project.identity.nameUpdated,
                              )
                            }}
                          />
                        ),
                        status: (
                          <ChoicePicker
                            value={project.status} options={PROJECT_STATUSES}
                            onPick={(status) => applyWrite(
                              updateProject({ status }), m.project.identity.statusUpdated,
                            )}
                          />
                        ),
                        priority: (
                          <PriorityPicker
                            value={project.priority} className="pv metadata-editable"
                            onPick={(priority) => applyWrite(
                              updateProject({ priority }), m.project.identity.priorityUpdated,
                            )}
                          ><ProjectPriorityTag priority={project.priority} /></PriorityPicker>
                        ),
                        topic: (
                          <ProjectAreasField
                            projectId={projectId} areas={projectAreas(project)} onError={report}
                            onSave={(topics) => writeProject(updateProject({ topics }), m.project.identity.topicUpdated)}
                            onRemove={(topics) => writeRemoval(
                              projectApi.update(projectId, { topics }), m.project.identity.topicUpdated,
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
                        if (next === '') { notice.refusal(m.project.identity.focusRequired(label)); return false }
                        // On submit, close any editor open elsewhere without waiting for this write; whether
                        // this field closes is left to InlineMetadataField, which follows the write's result
                        discardOpenEdits()
                        return writeProject(
                          updateProject({ focus: next }), m.project.identity.focusUpdated(label),
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
                          updateProject({ block: next === '' ? null : next }),
                          next === '' ? m.project.control.blockerCleared : m.project.control.blockerUpdated,
                        )
                      }}
                    />
                    <div className="pk">{m.project.identity.startLabel}</div>
                    <DateButton
                      iso={project.start} className="pv metadata-editable"
                      onPick={(start) => {
                        if (dnum(start) > dnum(project.due)) {
                          notice.refusal(m.project.identity.startAfterDue)
                          return
                        }
                        applyWrite(updateProject({ start }), m.project.identity.dateUpdated)
                      }}
                    />
                    <div className="pk">{m.project.identity.dueLabel}</div>
                    <DateButton
                      iso={project.due} className="pv metadata-editable"
                      onPick={(due) => {
                        if (dnum(due) < dnum(project.start)) {
                          notice.refusal(m.project.identity.dueBeforeStart)
                          return
                        }
                        applyWrite(updateProject({ due }), m.project.identity.dateUpdated)
                      }}
                    />
                    <div className="pk">{m.project.sections.papers}</div>
                    <div className="pv">
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
                        <div className="pv workspace-field" data-row-actions="">
                          <WorkspaceRoot
                            state={project.workspace.state} name={workspaceName ?? project.workspace.root}
                            root={project.workspace.root} onOpen={openWorkspace}
                          />
                          <RowActions>
                            <DotsMenu>
                              <MenuItem onSelect={refreshWorkspace}>{m.project.identity.refreshWorkspace}</MenuItem>
                              <MenuItem onSelect={openWorkspace}>
                                {m.project.identity.changeWorkspace}
                              </MenuItem>
                              <MenuItem
                                className="mi danger"
                                onSelect={() => applyWrite(
                                  projectApi.bindWorkspace(projectId, null),
                                  m.project.identity.workspaceDisconnected,
                                )}
                              >{m.project.identity.disconnectWorkspace}</MenuItem>
                            </DotsMenu>
                          </RowActions>
                        </div>
                      )}
                  </div>

                  <SectionHeading
                    variant="rail"
                    actions={(
                      // The demo's relAdd guard: an open placeholder is only refocused, keeping what was typed.
                      <AddAction
                        variant="section" ref={relAdd} label={m.project.links.addTitle}
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
                    onRemovePaper={(paperId, title) => applyRemoval(
                      projectApi.removePaper(projectId, paperId),
                      <TitleNote message={m.project.links.paperRemoved} title={plainTitle(title)} />,
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
                              onCancel={stopRel} onError={report}
                              onPick={(hit) => writeProject(
                                projectApi.addPaper(projectId, hit.id),
                                <TitleNote message={m.project.links.paperLinked} title={plainTitle(hit.title)} />,
                              )}
                            />
                          )
                          : relGroup === PROJECT_URL_GROUP
                            ? (
                              <ProjectUrlDraft
                                key="url" row={relRow} triggers={relTriggers} onCancel={stopRel}
                                onInvalid={() => notice.refusal(m.project.links.urlInvalid)}
                                onSubmit={(url, text) => writeProject(projectApi.createRelation(projectId, {
                                  group: PROJECT_URL_GROUP, text, url,
                                }), m.project.links.added)}
                              />
                            )
                          : (
                            <PickRow
                              key="page" row={relRow} triggers={relTriggers} allowNew
                              placeholder={m.project.links.pagePlaceholder} suggest={suggestPages}
                              onCancel={stopRel} onError={report}
                              onPick={(hit) => writeProject(projectApi.createRelation(projectId, {
                                group: 'Wiki', text: hit.title, page: hit.id,
                              }), m.project.links.added)}
                              onNew={(text) => writeProject(projectApi.createRelation(projectId, {
                                group: 'Wiki', text,
                              }), m.project.links.added)}
                            />
                          ),
                      }}
                    editing={relEditing === null
                      ? undefined
                      : {
                        id: relEditing.id,
                        row: relEditRow,
                        input: relEditing.url !== undefined
                          ? (
                            <ProjectUrlDraft
                              row={relEditRow} triggers={NO_TRIGGERS} onCancel={stopRelEdit}
                              initial={{ url: relEditing.url, text: relEditing.text }}
                              onInvalid={() => notice.refusal(m.project.links.urlInvalid)}
                              onSubmit={(url, text) => writeProject(projectApi.updateRelation(
                                projectId, relEditing.id, { text, url },
                              ), m.project.links.updated)}
                            />
                          )
                          : (
                            <PickRow
                              row={relEditRow} triggers={NO_TRIGGERS} allowNew initialText={relEditing.text}
                              placeholder={m.project.links.pagePlaceholder} suggest={suggestPages}
                              onCancel={stopRelEdit} onError={report}
                              onPick={(hit) => writeProject(projectApi.updateRelation(projectId, relEditing.id, {
                                text: hit.title, page: hit.id,
                              }), m.project.links.updated)}
                              onNew={(text) => writeProject(projectApi.updateRelation(projectId, relEditing.id, {
                                text,
                              }), m.project.links.updated)}
                            />
                          ),
                      }}
                    onEdit={setRelEditing}
                    onRemove={(relationId, text) => applyRemoval(
                      projectApi.deleteRelation(projectId, relationId),
                      <TitleNote message={m.project.links.removed} title={text} />,
                    )}
                  />

                  <ProjectAttachments
                    attachments={project.attachments} onAdd={addAttachments}
                    onReveal={(path) => void files.reveal(path).then((found) => {
                      if (!found) notice.refusal(m.project.attachments.missing)
                    })}
                    onRemove={(attachmentId) => applyRemoval(
                      projectApi.deleteAttachment(projectId, attachmentId), m.common.trashed,
                    )}
                  />
                </>
              )
              : (
                <ResearchNodePanel
                  graph={displayedGraph} events={visibleEvents}
                  ideas={(linkedIdeas ?? []).filter((idea) => idea.project === projectId && idea.node === node.id)} node={node}
                  tasks={project.tasks.filter((task) => node.tasks?.includes(task.id))}
                  onSelectTask={openTask} chatDeleted={chatDeleted}
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
