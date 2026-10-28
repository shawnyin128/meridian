import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import type {
  ProjectDetail as Project, ProjectWorkspace, ProjectWorkspaceBinding, RelationGroup, ResearchGraph as ResearchGraphData, ResearchIdea,
  ProjectFields, ProjectRecordedChange, ResearchIdeaGraphPlacement, TaskWindow, WorkspaceSpace, WorkspaceSpaceChoice, WorkspaceSpaceRef,
} from '../../shared/contract.js'
import { attachmentSizeText } from '../../shared/attachment-size.js'
import { projectControlState } from '../../shared/project-control.js'
import { researchPathState } from '../../shared/research-path.js'
import { withTaskNodes } from '../../shared/task-nodes.js'
import {
  FOCUS_KEY, projectTopics, projectDecisionItems, recordKind, recordOrigin, sortRecordsNewestFirst,
} from '../../shared/project-signals.js'
import { PROJECT_STATUSES } from '../../shared/vocabulary.js'
import { appMenu, files, idea as ideaApi, papers, project as projectApi, wiki } from '../ipc.js'
import {
  useCrumbTail, useEscapeLayer, useJump, useNotice, useToday, useVaultRevision,
} from '../shell/AppShell.js'
import { CommitActions } from '../components/CommitActions.js'
import { AddAction } from '../components/AddAction.js'
import { DraftForm } from '../components/DraftForm.js'
import { MenuItem } from '../components/ActionMenu.js'
import { EmptyState } from '../components/EmptyState.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { SidePanel } from '../components/SidePanel.js'
import { ChoicePicker, DateRangeField, DotsMenu, PriorityPicker } from '../components/FieldPickers.js'
import { IconButton } from '../components/IconButton.js'
import { IconOpen } from '../components/icons.js'
import { SegmentedControl } from '../components/SegmentedControl.js'
import { TabbedSection } from '../components/TabbedSection.js'
import { DraftSlot, focusDraft, useDraftSlot } from '../components/DraftSlot.js'
import { Item, RowActions } from '../components/Item.js'
import { List } from '../components/List.js'
import { TitleNote } from '../components/TitleNote.js'
import {
  ProjectAttention, ProjectEventList, ProjectEventRow,
} from '../components/project/ProjectSignals.js'
import {
  ProjectBlockerView, ProjectNextActionView,
} from '../components/project/ProjectControl.js'
import { ProjectIdentityFields, ProjectPriorityTag } from '../components/project/ProjectIdentity.js'
import { Property, PropertyList } from '../components/PropertyList.js'
import {
  PROJECT_PAPER_GROUP, PROJECT_RELATION_GROUPS, PROJECT_URL_GROUP, ProjectAgentSessions,
  ProjectTopicsField, ProjectMemo, ProjectRelations, ProjectUrlDraft,
} from '../components/project/ProjectSections.js'
import { NodeAssignment } from '../components/project/NodeAssignment.js'
import { EntityLink } from '../components/EntityLink.js'
import { ProjectConclusionPanel, ProjectConclusionRow } from '../components/project/ProjectConclusions.js'
import { ProjectTimeline } from '../components/project/ProjectTimeline.js'
import { nodeMode, ResearchGraph, ResearchNodePanel } from '../components/project/ResearchGraph.js'
import { Attachments } from '../components/Attachments.js'
import { IdeaPanel, IdeaSource, ideaSourceLabel, ownIdea, SourceChatDeleted } from '../components/ideas/IdeaPanel.js'
import { IdeaDraft, type IdeaDraftText } from '../components/ideas/IdeaDraft.js'
import { newPlanRow, ProjectPlan, ProjectTaskPanel } from '../components/project/ProjectPlan.js'
import type { PlanCreating, PlanTab } from '../components/project/ProjectPlan.js'
import { BackButton } from '../components/BackButton.js'
import { useMessages } from '../messages/useMessages.js'
import { InlineMetadataField } from '../components/InlineField.js'
import { ModalDialog } from '../components/ModalDialog.js'
import { DirectoryField, FieldRow, FieldRows, FormInput } from '../components/FormControls.js'
import { InlineMessage } from '../components/InlineMessage.js'
import { SshFolderPicker, SshHostField, useSshReach } from '../components/SshFolderPicker.js'
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
import { useIdeaFiles } from '../hooks/useIdeaFiles.js'
import { useScreenLoad } from '../hooks/useScreenLoad.js'
import { useTopLevel } from '../hooks/useTopLevel.js'
import { useScreenPoll } from '../hooks/useScreenPoll.js'
import { useDebounced } from '../hooks/useDebounced.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { useSourceChatDeleted } from '../hooks/useSourceChatDeleted.js'
import { ARRIVAL_FLASH_MS, useArrival } from '../hooks/useArrival.js'
import { FadeText } from '../components/FadeText.js'
import './shell.css'
import './ProjectDetail.css'

/** The Research log's three views: activity, conclusions, and the research graph. */
export type RecordTab = 'tl' | 'concl' | 'graph'

/** The choice of a new project space among a folder's existing ones. */
const NEW_SPACE = 'new'

/** How long a typed folder stays unchanged before its project spaces are read. */
const SPACES_SETTLE_MS = 600

/** The choice that picks `space`, a folder's root space or one nested space; the root's when undefined. */
const spaceKey = (space: WorkspaceSpaceRef | undefined): string =>
  space === undefined ? NEW_SPACE : space.kind === 'root' ? 'root' : `nested:${space.id}`

/** The space the choice `key` picks, as Core takes it. */
const spaceChoiceOf = (key: string): WorkspaceSpaceChoice => (key === NEW_SPACE
  ? { kind: 'new' }
  : key === 'root' ? { kind: 'root' } : { kind: 'nested', id: key.slice('nested:'.length) })

/** The folder of `space` in its workspace, which names a space whose manifest cannot be read. */
const spaceFolder = (space: WorkspaceSpaceRef): string =>
  space.kind === 'root' ? '.meridian' : `.meridian/projects/${space.id}`

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
 * `sourceChatDeleted` says the chat the idea came from is deleted. `onRename` saves the title
 * renamed in the panel's head.
 */
export function ProjectIdeaPanel({
  idea, graph, workspaceManaged, related = false, sourceChatDeleted = false, files,
  onClose, onRename, onOpenIdea, onOpenPaper, onCreateNode, onOpenNode, onSetNode,
}: {
  idea: ResearchIdea
  /** The idea's attachments section. */
  files?: ComponentProps<typeof IdeaPanel>['files']
  graph: ResearchGraphData
  workspaceManaged: boolean
  related?: boolean
  sourceChatDeleted?: boolean
  onClose: () => void
  onRename?: (title: string) => boolean | Promise<boolean>
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
  const nodeDraft = useDraftSlot<HTMLDivElement>(draft !== null, () => setDraft({ label: idea.title, after: '' }))
  return (
    <IdeaPanel
      idea={idea} files={files} onClose={onClose} onRename={onRename} onOpenSourcePaper={onOpenPaper} sourceChatDeleted={sourceChatDeleted}
      actions={(
        <IconButton label={m.project.idea.openIdea} size="nested" className="project-idea-open-idea" onClick={onOpenIdea}>
          <IconOpen />
        </IconButton>
      )}
    >
      {related ? null : (
        <NodeAssignment
          node={linkedNode === undefined ? undefined : { id: linkedNode.id, label: linkedNode.label, mode: nodeMode(linkedNode) }}
          nodes={graph.nodes} canUnlink onOpen={onOpenNode} onSet={onSetNode}
          create={workspaceManaged ? undefined : <AddAction size="compact" onClick={nodeDraft.start}>{m.project.idea.createNode}</AddAction>}
          draft={draft === null ? undefined : (
            <div ref={nodeDraft.slot}>
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
                    <FieldRow label={g.afterLabel}>
                      <ChoicePicker
                        appearance="field" aria-label={g.afterLabel} value={draft.after}
                        options={['', ...graph.nodes.map((node) => node.id)]}
                        label={(id) => (id === '' ? g.newRootOption : graph.nodes.find((node) => node.id === id)?.label ?? id)}
                        onPick={(after) => setDraft({ ...draft, after })}
                      />
                    </FieldRow>
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

/** The draft a project's rename from its page title is kept under, with its project, so it reopens where it was typed. */
const TITLE_RENAME = 'title-rename'

/** The draft older Apps kept a project's name under while it was typed in the rail's name field. */
const RAIL_NAME = 'name'

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
  const ideaDraft = useDraftSlot(draft !== null, () => setDraft({ title: '', body: '' }))
  const add = useRef<HTMLButtonElement>(null)
  const triggers = useMemo(() => [add], [])
  const carried = (ideas ?? []).filter((idea) => idea.project === projectId)
  const related = (ideas ?? []).filter((idea) => idea.project !== projectId && idea.relations?.projects.includes(projectId) === true)
  const sparked = (ideas ?? []).filter((idea) => !carried.includes(idea) && !related.includes(idea) && idea.sourceProject === projectId)
  const row = (idea: ResearchIdea, tag: string | null) => {
    const source = ideaSourceLabel(idea)
    const ideaNode = tag === null ? graph.nodes.find((node) => node.id === idea.node) : undefined
    return (
      <Item
        className="project-idea-row" selected={selectedId === idea.id}
        data-idea={idea.id} key={idea.id} onActivate={() => onSelect(idea.id)}
        title={<FadeText className="project-idea-title" label={idea.title}>{idea.title}</FadeText>}
        tags={(
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
        )}
        trailing={ownIdea(idea) ? null : (
          <FadeText className="project-idea-source" label={m.project.idea.sourceTag(source)}>
            <IdeaSource idea={idea} message={m.project.idea.sourceTag} />
          </FadeText>
        )}
      />
    )
  }
  const shown = carried.length + related.length + sparked.length
  return (
    <>
      <SectionHeading
        actions={(
          <AddAction size="compact" ref={add} label={m.ideas.create} onClick={ideaDraft.start}>{m.project.idea.kind}</AddAction>
        )}
        count={shown}
      >{m.project.linkedIdeas}
      </SectionHeading>
      {ideas === null
        ? (error === null ? <LoadingPlaceholder shape="rows" count={2} /> : <PageError variant="section" error={error} />)
        : shown === 0 && draft === null
        ? <EmptyState variant="section" />
        : (
          <List className="project-ideas" variant="embedded">
            {[...carried].sort(newestFirst).map((idea) => row(idea, null))}
            {[...related].sort(newestFirst).map((idea) => row(idea, m.project.sections.links))}
            {draft === null ? null : (
              <DraftSlot className="project-idea-draft" slot={ideaDraft.slot}>
                <IdeaDraft
                  key={projectId} draft={draft} triggers={triggers} onChange={setDraft} onCancel={() => setDraft(null)}
                  onSave={(title, body) => onCreate(title, body).then((created) => { if (created) setDraft(null) })}
                />
              </DraftSlot>
            )}
            {[...sparked].sort(newestFirst).map((idea) => row(idea, m.project.sections.source))}
          </List>
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
  const m = useMessages()
  const railFade = useScrollFade('y')
  const [project, setProject] = useState<Project | null>(null)
  const [linkedIdeas, setLinkedIdeas] = useState<ResearchIdea[] | null>(null)
  const [ownRelAdding, setRelAdding] = useState(false)
  const [ownRelGroup, setOwnRelGroup] = useState<string>(PROJECT_RELATION_GROUPS[0])
  const [ownRelEditing, setRelEditing] = useState<RelationGroup['items'][number] | null>(null)
  // A new object on every locate: clicking the same row again changes its identity, so the effect below reruns.
  const [flash, setFlash] = useState<{ id: string } | null>(null)
  const [hoverMilestone, setHoverMilestone] = useState<string | null>(null)
  const edits = useDrafts<EditDraft>(['project', projectId])
  const names = useDrafts<string>(['project', projectId])
  const railName = names.get(RAIL_NAME)
  // A name an older App kept from the rail's name field reopens as the title's rename it now is.
  useEffect(() => {
    if (railName === undefined) return
    if (names.get(TITLE_RENAME) === undefined) names.set(TITLE_RENAME, railName)
    names.drop(RAIL_NAME)
  }, [railName, names])
  const [creating, setCreating] = useDraft<PlanCreating>(['project', projectId], 'new-row')
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
  const [sshPort, setSshPort] = useState('')
  const [sshPath, setSshPath] = useState('')
  const [pickingSsh, setPickingSsh] = useState(false)
  const [binding, setBinding] = useState<'local' | 'ssh' | null>(null)
  /** The project spaces the folder last inspected holds, by the binding it was inspected for. */
  const [spaces, setSpaces] = useState<{ key: string; held: WorkspaceSpace[]; failed: boolean } | null>(null)
  const [spaceChoice, setSpaceChoice] = useState<string>(NEW_SPACE)
  const planList = useRef<HTMLDivElement>(null)
  const planDraft = useRef<HTMLElement>(null)
  const planAdd = useRef<HTMLButtonElement>(null)
  const ganttAdd = useRef<HTMLButtonElement>(null)
  const relAdd = useRef<HTMLButtonElement>(null)
  const relTriggers = useMemo(() => [relAdd], [])
  const relEditRow = useRef<HTMLDivElement>(null)

  // A relation being added or edited is kept as a draft of the project, and reopens where it was.
  const relationItems = project?.id === projectId ? project.relations.flatMap((group) => group.items) : null
  const relations = useDrafts<string>(['project', projectId, 'relation'], relationItems === null ? null : [
    ...PROJECT_RELATION_GROUPS.map((group) => `add:${group}`), `add:${PROJECT_URL_GROUP}:name`,
    ...relationItems.flatMap((item) => [`edit:${item.id}`, `edit:${item.id}:name`]),
  ])
  const keptAddGroup = PROJECT_RELATION_GROUPS.find((group) => relations.get(`add:${group}`) !== undefined)
  const relAdding = ownRelAdding || keptAddGroup !== undefined
  const relGroup = ownRelAdding ? ownRelGroup : keptAddGroup ?? ownRelGroup
  // The demo's relAdd guard: an open placeholder is only refocused, keeping what was typed.
  const relDraft = useDraftSlot<HTMLDivElement>(relAdding, () => {
    setOwnRelGroup(relGroup)
    setRelAdding(true)
  })
  const relRow = relDraft.slot
  const relEditing = ownRelEditing ?? relationItems?.find((item) => relations.get(`edit:${item.id}`) !== undefined) ?? null
  const dropAdds = useCallback(() => {
    for (const group of PROJECT_RELATION_GROUPS) relations.drop(`add:${group}`)
    relations.drop(`add:${PROJECT_URL_GROUP}:name`)
  }, [relations])
  const setRelGroup = (group: string) => {
    dropAdds()
    setRelAdding(true)
    setOwnRelGroup(group)
  }
  const stopRel = useCallback(() => {
    dropAdds()
    setRelAdding(false)
  }, [dropAdds])
  const stopRelEdit = useCallback(() => {
    if (relEditing !== null) {
      relations.drop(`edit:${relEditing.id}`)
      relations.drop(`edit:${relEditing.id}:name`)
    }
    setRelEditing(null)
  }, [relations, relEditing])
  const notice = useNotice()
  const today = useToday()
  const clearNode = useCallback(() => setSelectedNode(null), [])
  const clearIdea = useCallback(() => setSelectedIdeaId(null), [])
  const clearTask = useCallback(() => setSelectedTaskId(null), [])
  const clearConclusion = useCallback(() => setSelectedConclusion(null), [])
  // Picking the current plan or record tab again closes the detail opened from that tab.
  const toPlanTop = useTopLevel(selectedTaskId !== null, clearTask)
  const toRecordTop = useTopLevel(
    record === 'graph' ? selectedNode !== null : record === 'concl' && selectedConclusion !== null,
    record === 'graph' ? clearNode : clearConclusion,
  )
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
  const ideaFiles = useIdeaFiles(load)
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
    document.querySelector('.screenslot:not([hidden]) .project-detail-panel .panel-body')?.scrollTo({ top: 0 })
  }, [selectedNode, selectedIdeaId, selectedConclusion])

  useArrival(flash, true, ({ id }) => planList.current?.querySelector(`[data-row="${CSS.escape(id)}"]`))
  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), ARRIVAL_FLASH_MS)
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
  }, [setCreating, stopRel, stopRelEdit, edits])

  /**
   * Finishes a write that returns the project: the project goes into state, then `write` bumps the
   * vault revision. A failed write is reported and returns false. Placeholder submissions come straight
   * here: the placeholder closes or stays open by itself depending on the result, so nothing is lost.
   */
  const writeProject = (op: Promise<Project>): Promise<boolean> => write(op.then((p) => setProject(p)))

  /**
   * A write not made from a placeholder: first discards any open editor, as the demo's renderProject
   * rewrote the whole deskBody.
   */
  const applyWrite = (op: Promise<Project>) => {
    discardOpenEdits()
    void writeProject(op)
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

  /**
   * The choice a folder's project spaces `held` start on: this project's space it is bound to now,
   * else this project's first space there, else a fresh start.
   */
  const firstChoice = (held: readonly WorkspaceSpace[]): string => {
    const own = held.filter((found) => found.project?.id === projectId)
    const plan = project?.workspace?.planPath.replaceAll('\\', '/')
    const bound = own.find((found) => plan?.endsWith(`/${spaceFolder(found.space)}/control/plan.json`) === true)
    return spaceKey((bound ?? own[0])?.space)
  }

  /**
   * Reads the project spaces of the folder `target` names and keeps them by `target`. A folder that
   * cannot be read is kept as failed, holding none, so it offers only a new space.
   */
  const inspectFolder = async (target: ProjectWorkspaceBinding): Promise<WorkspaceSpace[]> => {
    const read = await projectApi.workspaceSpaces(target).then(
      (held) => ({ held, failed: false }), () => ({ held: [], failed: true }),
    )
    setSpaces({ key: JSON.stringify(target), ...read })
    setSpaceChoice(firstChoice(read.held))
    return read.held
  }

  /**
   * Connects the project to the folder `target` names, in the space the space choice picks. A
   * folder not inspected yet is inspected first; when it holds spaces the choice shows them and
   * nothing is bound until the add button is pressed again. A folder that cannot be inspected is
   * bound as one holding none, and the bind reports why it cannot be used.
   */
  const connectWorkspace = async (target: ProjectWorkspaceBinding) => {
    setBinding(target.kind)
    const shown = spaces?.key === JSON.stringify(target) ? spaces.held : null
    const held = shown ?? await inspectFolder(target)
    if (shown === null && held.length > 0) {
      setBinding(null)
      return
    }
    const connected = await writeProject(projectApi.bindWorkspace(
      projectId, target, held.length === 0 ? { kind: 'new' } : spaceChoiceOf(spaceChoice),
    ))
    setBinding(null)
    if (connected) setWorkspaceOpen(false)
  }

  const connectLocalWorkspace = () => connectWorkspace({ kind: 'local', root: localPath.trim() })

  const openWorkspace = () => {
    const workspace = project?.workspace
    const ssh = workspace?.kind === 'ssh'
    setWorkspaceMode(ssh ? 'ssh' : 'local')
    setLocalPath(workspace?.kind === 'local' ? workspace.root : '')
    setSshHost(ssh ? workspace.host ?? '' : '')
    setSshPort(ssh && workspace.port !== undefined ? String(workspace.port) : '')
    setSshPath(ssh ? workspace.root : '')
    setPickingSsh(false)
    // The folder may have gained or lost spaces since it was last read.
    setSpaces(null)
    setWorkspaceOpen(true)
  }

  const sshPortNumber = sshPort.trim() === '' ? undefined : Number(sshPort)
  const sshTarget = { host: sshHost.trim(), ...(sshPortNumber === undefined ? {} : { port: sshPortNumber }) }
  const reach = useSshReach(workspaceOpen && workspaceMode === 'ssh' ? sshTarget : null)

  const sshBinding: ProjectWorkspaceBinding = { kind: 'ssh', ...sshTarget, path: sshPath.trim() }
  const connectSshWorkspace = () => connectWorkspace(sshBinding)
  /** The folder the open form names, once a path is filled in (and, over SSH, the host reached). */
  const folderTarget: ProjectWorkspaceBinding | null = !workspaceOpen ? null
    : workspaceMode === 'local'
      ? (localPath.trim() === '' ? null : { kind: 'local', root: localPath.trim() })
      : (reach.state === 'ready' && sshPath.trim() !== '' ? sshBinding : null)
  const folderKey = folderTarget === null ? null : JSON.stringify(folderTarget)
  const [settledFolder] = useDebounced(folderKey, SPACES_SETTLE_MS)
  useEffect(() => {
    if (folderTarget === null || settledFolder !== folderKey || spaces?.key === folderKey) return
    void inspectFolder(folderTarget)
  }, [settledFolder, folderKey])
  const inspected = folderKey !== null && spaces?.key === folderKey ? spaces : null
  const shownSpaces = inspected === null || inspected.failed ? null : inspected.held
  const spaceRow = folderTarget === null ? null : (
    <FieldRow label={m.project.workspace.spaceLabel}>
      {shownSpaces === null && inspected?.failed !== true
        ? <LoadingPlaceholder shape="ring" holds="field" />
        : (
          <ChoicePicker
            appearance="field" aria-label={m.project.workspace.spaceLabel} value={spaceChoice}
            options={[...(shownSpaces ?? []).map((found) => spaceKey(found.space)), NEW_SPACE]}
            label={(option) => {
              if (option === NEW_SPACE) return m.project.workspace.newSpace
              const found = shownSpaces!.find((candidate) => spaceKey(candidate.space) === option)!
              return found.project?.name ?? spaceFolder(found.space)
            }}
            note={(option) => (shownSpaces?.find((candidate) => spaceKey(candidate.space) === option)?.issue === undefined
              ? undefined
              : m.project.workspace.spaceUnreadable)}
            onPick={setSpaceChoice}
          />
        )}
    </FieldRow>
  )

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
    focusDraft(planDraft.current)
    return true
  }

  const startTask = (date = today, window: TaskWindow | null = null) => {
    onTab('task')
    if (focusOpenRow('task')) return
    setCreating(newPlanRow('task', date, window))
  }

  const startMilestone = (date: string) => {
    onTab('ms')
    if (focusOpenRow('ms')) return
    setCreating(newPlanRow('ms', date))
  }

  /**
   * Adds the dropped or chosen local files as attachments, one after another. Only the absolute path
   * is recorded; the file itself is not copied.
   */
  const addAttachments = (dropped: File[]) => {
    const local = ideaFiles.local(dropped)
    if (local.length === 0) return
    let chain = Promise.resolve(project)
    for (const file of local) {
      chain = chain.then(() =>
        projectApi.createAttachment(projectId, {
          name: file.name, size: attachmentSizeText(file.size), path: files.pathOf(file),
        }))
    }
    applyWrite(chain)
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
  /** The one panel that an open task, idea, conclusion or node shows in, in the rail's place. */
  const detailPanel = (content: ReactNode) => <SidePanel surface="card" className="project-detail-panel">{content}</SidePanel>
  const workspaceLeaf = project.workspace?.root.split(/[\\/]/).filter(Boolean).at(-1)
  const workspaceName = project.workspace?.kind === 'ssh'
    ? `${project.workspace.host}:${workspaceLeaf ?? project.workspace.root}`
    : workspaceLeaf

  const placeIdeaOnGraph = async (
    idea: ResearchIdea, placement: ResearchIdeaGraphPlacement,
  ): Promise<boolean> => {
    let nodeId: string | null = null
    const saved = await write(
      ideaApi.placeOnGraph(idea.id, placement).then((result) => {
        nodeId = result.nodeId
        if (result.project !== null) setProject(result.project)
        setLinkedIdeas((held) => held?.map((candidate) => (
          candidate.id === result.idea.id ? result.idea : candidate
        )) ?? null)
      }),
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
        <PageTitle rename={{
          label: m.project.identity.nameFieldLabel, value: project.name, keep: { scope: ['project', projectId], target: TITLE_RENAME },
          onSave: (name) => write(projectApi.update(projectId, { name }).then((renamed) => {
            setProject(renamed.project)
            return renamed
          })),
        }}
        >{project.name}
        </PageTitle>
      </PageHeader>
      <PageError error={error} />

      <ModalDialog
        open={workspaceOpen} onOpenChange={setWorkspaceOpen} size="form" className="workspace-dialog"
        title={m.project.workspace.dialogTitle}
        actions={(
          <CommitActions
            place="foot" onCancel={() => setWorkspaceOpen(false)}
            saving={binding !== null}
            canSave={workspaceMode === 'local' || (reach.state === 'ready' && sshPath.trim() !== '')}
            {...workspaceMode === 'local'
              ? { form: 'workspaceLocal', saveLabel: m.project.workspace.add, busyLabel: m.project.workspace.adding }
              : { form: 'workspaceSsh', saveLabel: m.project.workspace.add, busyLabel: m.project.workspace.adding }}
          />
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
                  <FieldRows>
                    <FieldRow label={m.project.workspace.pathLabel}>
                      <DirectoryField
                        value={localPath} autoFocus required placeholder={m.project.workspace.localPlaceholder}
                        chooseLabel={m.project.workspace.chooseLocal}
                        onChoose={() => { void chooseLocalWorkspace() }}
                        onChange={(event) => setLocalPath(event.target.value)}
                      />
                    </FieldRow>
                    {spaceRow}
                  </FieldRows>
                </form>
              )
              : (
                <form
                  id="workspaceSsh" className="workspace-form"
                  onSubmit={(event) => { event.preventDefault(); void connectSshWorkspace() }}
                >
                  <FieldRows>
                    <FieldRow label={m.project.workspace.hostLabel}>
                      <SshHostField
                        value={sshHost} autoFocus required placeholder={m.project.workspace.hostPlaceholder}
                        onValue={setSshHost} onError={report} onBlur={reach.settle}
                      />
                    </FieldRow>
                    <FieldRow label={m.project.workspace.portLabel}>
                      <FormInput
                        appearance="field" value={sshPort} type="number" min={1} max={65_535}
                        placeholder={m.project.workspace.portLabel}
                        onChange={(event) => setSshPort(event.target.value)} onBlur={reach.settle}
                      />
                    </FieldRow>
                    <FieldRow label={m.project.workspace.pathLabel}>
                      {reach.state === 'failed'
                        ? <InlineMessage tone="error" variant="field">{reach.issue}</InlineMessage>
                        : reach.state === 'checking'
                          ? <LoadingPlaceholder shape="ring" holds="field" />
                          : (
                            <DirectoryField
                              value={sshPath} required placeholder={m.project.workspace.remotePlaceholder}
                              chooseLabel={m.project.workspace.chooseLocal} disabled={reach.state === 'idle'}
                              onChoose={() => setPickingSsh(true)}
                              onChange={(event) => setSshPath(event.target.value)}
                            />
                          )}
                    </FieldRow>
                    {spaceRow}
                  </FieldRows>
                </form>
              )}
      </ModalDialog>
      <SshFolderPicker
        target={workspaceOpen && workspaceMode === 'ssh' && pickingSsh ? sshTarget : null}
        start={sshPath.trim() === '' ? null : sshPath.trim()}
        onChoose={(path) => {
          setSshPath(path)
          setPickingSsh(false)
        }}
        onClose={() => setPickingSsh(false)}
      />

      <PageBody className="project-detail-body">
        <ProjectTimeline
          project={project} hoverMilestone={hoverMilestone} onHoverMilestone={setHoverMilestone}
          onLocateTask={locateTask}
          onMoveTask={(taskId, start, end) => applyWrite(projectApi.updateTask(projectId, taskId, { start, end }))}
          onMoveTaskWindow={(taskId, patch) => applyWrite(projectApi.updateTask(projectId, taskId, patch))}
          onMoveMilestone={(milestoneId, date) => applyWrite(projectApi.updateMilestone(projectId, milestoneId, { date }))}
          onReorderTasks={reorderTasks}
          onNewTask={startTask} onNewMilestone={startMilestone}
          onCreateMilestone={(date, title) => writeProject(projectApi.createMilestone(projectId, { date, title, done: false }))}
          onUpdateMilestone={(milestoneId, patch) => writeProject(projectApi.updateMilestone(projectId, milestoneId, patch))}
          onDeleteMilestone={(milestoneId) => applyRemoval(
            projectApi.deleteMilestone(projectId, milestoneId), m.project.plan.milestoneDeleted,
          )}
          newActionRef={ganttAdd}
        />

        {attn.length > 0
          ? (
            <>
              <SectionHeading count={attn.length}>{m.project.signals.heading}</SectionHeading>
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
              projectId={projectId} project={project} tab={tab} today={today} creating={creating}
              flashId={flash?.id ?? null} selectedTaskId={selectedTaskId}
              listRef={planList} draftRef={planDraft} addRef={planAdd} timelineAddRef={ganttAdd}
              onTab={onTab} onReselectTab={toPlanTop} onDiscardOpenEdits={discardOpenEdits}
              onStartTask={() => startTask()} onStartMilestone={startMilestone}
              onCreating={setCreating} onCancelCreate={() => setCreating(null)} onHoverMilestone={setHoverMilestone}
              onCreateTask={({ window, ...draft }) => writeProject(
                projectApi.createTask(projectId, {
                  ...draft, ...(window === null ? {} : { window }),
                }),
              )}
              onCreateMilestone={(draft) => writeProject(projectApi.createMilestone(projectId, draft))}
              onUpdateTask={(taskId, patch) => writeProject(projectApi.updateTask(projectId, taskId, patch))}
              onDeleteTask={(taskId) => applyRemoval(
                projectApi.deleteTask(projectId, taskId), m.project.plan.taskDeleted,
              )}
              onReorderTasks={reorderTasks}
              onOpenTask={openTask}
              onUpdateMilestone={(milestoneId, patch) => writeProject(projectApi.updateMilestone(projectId, milestoneId, patch))}
              onDeleteMilestone={(milestoneId) => applyRemoval(
                projectApi.deleteMilestone(projectId, milestoneId), m.project.plan.milestoneDeleted,
              )}
            />

            <TabbedSection
              heading={m.project.sections.records} label={m.project.recordViewLabel} value={record}
              headingRef={recordHeading} panelClassName="record-view" error={project.workspace?.issue} onReselect={toRecordTop}
              onChange={(value) => {
                holdRecordHeading()
                onRecord(value)
                if (value !== 'graph') setSelectedNode(null)
                if (value !== 'concl') setSelectedConclusion(null)
                discardOpenEdits()
              }}
              tabs={[
                {
                  value: 'tl', label: m.project.recordModes.activity,
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
                  value: 'concl', label: m.project.recordModes.conclusions,
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
                  value: 'graph', label: m.project.sections.graph,
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
              }))}
              onSelect={(ideaId) => {
                setSelectedNode(null)
                setSelectedConclusion(null)
                setSelectedIdeaId(ideaId)
                discardOpenEdits()
              }}
            />

            <ProjectMemo
              key={projectId} edit={editText(edits, 'memo', project.memo)} onOpen={openWikiPage}
              onSave={(memo) => applyWrite(updateProject({ memo }))}
            />
          </div>

          {selectedTask !== undefined
            ? detailPanel(
              <ProjectTaskPanel
                projectId={projectId} task={selectedTask} onClose={clearTask} onOpenNode={goToRecordNode}
                node={nodeLook(taskGraph.nodes.find((candidate) => candidate.tasks?.includes(selectedTask.id))?.id)}
                nodes={displayedGraph.nodes}
                handSet={displayedGraph.nodes.some((candidate) => candidate.id === project.taskNodes?.[selectedTask.id])}
                onSaveNote={(note) => writeProject(projectApi.updateTask(projectId, selectedTask.id, { note }))}
                onSetNode={(nodeId) => { void writeProject(projectApi.setTaskNode(projectId, selectedTask.id, nodeId)) }}
              />
            )
            : selectedIdea !== undefined
            ? detailPanel(
              <ProjectIdeaPanel
                idea={selectedIdea}
                graph={displayedGraph}
                workspaceManaged={project.workspace !== undefined}
                related={selectedIdea.project !== projectId} sourceChatDeleted={chatDeleted(selectedIdea)}
                files={ideaFiles.section(selectedIdea.id)}
                onClose={clearIdea}
                onRename={(title) => write(ideaApi.update(selectedIdea.id, { title }))}
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
            ? detailPanel(
              <ProjectConclusionPanel
                projectId={projectId} projectName={project.name} conclusion={conclusion} node={nodeLook(conclusion.node)}
                onClose={clearConclusion}
                onVerify={(verified, fingerprint) => {
                  void writeProject(projectApi.verifyConclusion(projectId, verified, fingerprint))
                    .then((saved) => { if (!saved) refreshWorkspace() })
                }}
                onUnverify={(verified) => {
                  void writeProject(projectApi.unverifyConclusion(projectId, verified))
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
              <div className="wkside" ref={railFade} data-fade-paint="">
                <SectionHeading level="group">{m.project.identity.heading}</SectionHeading>
                <PropertyList>
                  <ProjectIdentityFields
                    project={project}
                    fields={{
                      status: (
                        <ChoicePicker
                          value={project.status} options={PROJECT_STATUSES}
                          onPick={(status) => applyWrite(updateProject({ status }))}
                        />
                      ),
                      priority: (
                        <PriorityPicker
                          value={project.priority} className="pv metadata-editable"
                          onPick={(priority) => applyWrite(updateProject({ priority }))}
                        ><ProjectPriorityTag priority={project.priority} /></PriorityPicker>
                      ),
                      topic: (
                        <ProjectTopicsField
                          projectId={projectId} topics={projectTopics(project)} onError={report}
                          onSave={(topics) => writeProject(updateProject({ topics }))}
                          onRemove={(topics) => writeRemoval(
                            projectApi.update(projectId, { topics }), m.project.identity.topicUpdated,
                          )}
                        />
                      ),
                    }}
                  />
                  <Property label={m.project.identity.focusLabel[FOCUS_KEY[project.status]]}>
                    <InlineMetadataField
                      label={m.project.identity.focusLabel[FOCUS_KEY[project.status]]} value={project.focus}
                      keep={{ scope: ['project', projectId], target: 'focus' }}
                      onSave={(focus) => {
                        const next = focus.trim()
                        const label = m.project.identity.focusLabel[FOCUS_KEY[project.status]]
                        if (next === '') { notice.refusal(m.project.identity.focusRequired(label)); return false }
                        // On submit, close any editor open elsewhere without waiting for this write; whether
                        // this field closes is left to InlineMetadataField, which follows the write's result
                        discardOpenEdits()
                        return writeProject(updateProject({ focus: next }))
                      }}
                    />
                  </Property>
                  <Property label={m.project.control.nextAction}><ProjectNextActionView action={controlState.next} /></Property>
                  <Property label={m.project.control.blocker}>
                    <InlineMetadataField
                      label={m.project.control.blocker} value={project.block ?? ''} keep={{ scope: ['project', projectId], target: 'block' }}
                      display={<ProjectBlockerView blocker={controlState.blocker} />}
                      onSave={(value) => {
                        const next = value.trim()
                        return writeProject(updateProject({ block: next === '' ? null : next }))
                      }}
                    />
                  </Property>
                  <DateRangeField
                    start={project.start} end={project.due} className="pv metadata-editable"
                    onChange={(range) => applyWrite(updateProject({
                      ...(range.start === project.start ? {} : { start: range.start }),
                      ...(range.end === project.due ? {} : { due: range.end }),
                    }))}
                  >
                    {(start, due) => (
                      <>
                        <Property label={m.project.identity.startLabel}>{start}</Property>
                        <Property label={m.project.identity.dueLabel}>{due}</Property>
                      </>
                    )}
                  </DateRangeField>
                  <Property label={m.project.sections.papers}>{m.project.identity.paperCount(project.paperCount)}</Property>
                  <Property label={m.project.identity.workspaceLabel}>
                    {project.workspace === undefined
                      ? (
                        <button className="pv metadata-editable" onClick={openWorkspace}>
                          {m.project.workspace.connect}
                        </button>
                      )
                      : (
                        <div className="workspace-field" data-row-actions="">
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
                                onSelect={() => applyWrite(projectApi.bindWorkspace(projectId, null))}
                              >{m.project.identity.disconnectWorkspace}</MenuItem>
                            </DotsMenu>
                          </RowActions>
                        </div>
                      )}
                  </Property>
                </PropertyList>

                <SectionHeading
                  level="group"
                  actions={(
                    <AddAction size="compact" ref={relAdd} label={m.project.links.addTitle} onClick={relDraft.start}>
                      {m.project.sections.links}
                    </AddAction>
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
                            onNew={() => false} kept={{ drafts: relations, target: `add:${PROJECT_PAPER_GROUP}` }}
                            onCancel={stopRel} onError={report}
                            onPick={(hit) => writeProject(projectApi.addPaper(projectId, hit.id))}
                          />
                        )
                        : relGroup === PROJECT_URL_GROUP
                          ? (
                            <ProjectUrlDraft
                              key="url" row={relRow} triggers={relTriggers} onCancel={stopRel}
                              kept={{ drafts: relations, target: `add:${PROJECT_URL_GROUP}` }}
                              onInvalid={() => notice.refusal(m.project.links.urlInvalid)}
                              onSubmit={(url, text) => writeProject(projectApi.createRelation(projectId, {
                                group: PROJECT_URL_GROUP, text, url,
                              }))}
                            />
                          )
                        : (
                          <PickRow
                            key="page" row={relRow} triggers={relTriggers} allowNew
                            placeholder={m.project.links.pagePlaceholder} suggest={suggestPages}
                            onCancel={stopRel} onError={report} kept={{ drafts: relations, target: 'add:Wiki' }}
                            onPick={(hit) => writeProject(projectApi.createRelation(projectId, {
                              group: 'Wiki', text: hit.title, page: hit.id,
                            }))}
                            onNew={(text) => writeProject(projectApi.createRelation(projectId, {
                              group: 'Wiki', text,
                            }))}
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
                            kept={{ drafts: relations, target: `edit:${relEditing.id}` }}
                            onInvalid={() => notice.refusal(m.project.links.urlInvalid)}
                            onSubmit={(url, text) => writeProject(projectApi.updateRelation(
                              projectId, relEditing.id, { text, url },
                            ))}
                          />
                        )
                        : (
                          <PickRow
                            row={relEditRow} triggers={NO_TRIGGERS} allowNew initialText={relEditing.text}
                            placeholder={m.project.links.pagePlaceholder} suggest={suggestPages}
                            onCancel={stopRelEdit} onError={report} kept={{ drafts: relations, target: `edit:${relEditing.id}` }}
                            onPick={(hit) => writeProject(projectApi.updateRelation(projectId, relEditing.id, {
                              text: hit.title, page: hit.id,
                            }))}
                            onNew={(text) => writeProject(projectApi.updateRelation(projectId, relEditing.id, {
                              text,
                            }))}
                          />
                        ),
                    }}
                  onEdit={setRelEditing}
                  onRemove={(relationId, text) => applyRemoval(
                    projectApi.deleteRelation(projectId, relationId),
                    <TitleNote message={m.project.links.removed} title={text} />,
                  )}
                />

                <Attachments
                  attachments={[
                    ...project.attachments,
                    ...(linkedIdeas ?? []).filter((idea) => idea.project === projectId).flatMap((idea) => ideaFiles.of(idea.id)),
                  ]}
                  onAdd={addAttachments} onReveal={ideaFiles.reveal}
                  onRemove={(attachmentId) => {
                    const idea = ideaFiles.ideaOf(attachmentId)
                    if (idea !== undefined) ideaFiles.remove(idea, attachmentId)
                    else applyRemoval(projectApi.deleteAttachment(projectId, attachmentId), m.common.trashed)
                  }}
                />
              </div>
            )
            : detailPanel(
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
        </div>
      </PageBody>
    </PageShell>
  )
}
