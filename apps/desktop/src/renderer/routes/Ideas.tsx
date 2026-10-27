import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ComponentProps } from 'react'
import type {
  IdeaRelations as IdeaRelationsValue, ProjectDetail, ProjectSummary, ResearchIdea,
} from '../../shared/contract.js'
import { FINISHED_PROJECT, SHELVED_PROJECT } from '../../shared/vocabulary.js'
import { idea as ideaApi, project as projectApi, wiki as wikiApi } from '../ipc.js'
import { MenuItem, MenuSeparator } from '../components/ActionMenu.js'
import { SortMenu } from '../components/SortMenu.js'
import { InlineMessage } from '../components/InlineMessage.js'
import { ChoicePicker, DotsMenu } from '../components/FieldPickers.js'
import { InlineField } from '../components/InlineField.js'
import { MarkdownSection } from '../components/Markdown.js'
import { Group, GroupedList } from '../components/GroupedList.js'
import { EmptyState } from '../components/EmptyState.js'
import { AddAction } from '../components/AddAction.js'
import { IdeaDraft, type IdeaDraftText } from '../components/ideas/IdeaDraft.js'
import { IdeaPanel, IdeaSource, ideaSourceLabel, ownIdea, SourceChatDeleted } from '../components/ideas/IdeaPanel.js'
import { IdeaNodeCandidate } from '../components/ideas/IdeaNodeCandidate.js'
import { IdeaRelations } from '../components/ideas/IdeaRelations.js'
import { nodeMode } from '../components/project/ResearchGraph.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { SidePanel } from '../components/SidePanel.js'
import { SplitColumn, SplitPage } from '../components/SplitPage.js'
import { TrailingDate } from '../components/DateTimeDisplay.js'
import { DraftSlot, useDraftSlot } from '../components/DraftSlot.js'
import { Item, ItemMeta, ItemOpen } from '../components/Item.js'
import { List } from '../components/List.js'
import { Table, TableCell, TableOpen, TableRow } from '../components/Table.js'
import { ProjectLabel, ProjectStatusTag } from '../components/project/ProjectIdentity.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { useEscapeLayer, useJump, useScreenReentry, useVaultRevision } from '../shell/AppShell.js'
import { BackButton } from '../components/BackButton.js'
import { useDraft, useDrafts, type Drafts, type TextEdit } from '../hooks/useDrafts.js'
import { useJumpOrigin } from '../hooks/useJumpOrigin.js'
import { useScreenLoad } from '../hooks/useScreenLoad.js'
import { useTopLevel } from '../hooks/useTopLevel.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { useSourceChatDeleted } from '../hooks/useSourceChatDeleted.js'
import { useDragReorder, type Reorderable } from '../hooks/useDragReorder.js'
import { DragHandle } from '../components/DragHandle.js'
import { failureOf } from '../lib/failure-label.js'
import { useMessages } from '../messages/useMessages.js'
import { AgentLabel, SourceLabel } from '../components/SourceLabel.js'
import { Tag } from '../components/Tag.js'
import { FadeText } from '../components/FadeText.js'
import { Button } from '../components/Button.js'
import './Ideas.css'


/**
 * How far an idea has turned into work: `open` is not started, `active` is carried out in a project,
 * `done` once that project finished or the idea's node there closed, `archived` set aside before it was
 * done. An idea carried out in a shelved project is still `active`.
 */
type IdeaStatus = 'open' | 'active' | 'done' | 'archived'

/** The status of `idea`, given the project it is carried out in and that project's details, when read. */
function ideaStatus(idea: ResearchIdea, project: ProjectSummary | undefined, detail: ProjectDetail | undefined): IdeaStatus {
  const graph = detail?.workspace?.graph ?? detail?.graph
  const nodeDone = idea.node !== undefined && graph?.nodes.find((node) => node.id === idea.node)?.state === 'done'
  if (idea.project !== undefined && (project?.status === FINISHED_PROJECT || nodeDone)) return 'done'
  if (idea.archived) return 'archived'
  return idea.project === undefined ? 'open' : 'active'
}

/** The width the project column of the ideas by project starts at, and that of each count column, in px. */
const STATS_NAME_WIDTH = 240
const STATS_COUNT_WIDTH = 120

/** Every project in `projects` order with the ideas sparked in it and how many of those are in progress or done, most first. */
function ideasByProject(ideas: readonly { idea: ResearchIdea; status: IdeaStatus }[], projects: readonly ProjectSummary[]) {
  return projects
    .map((project) => {
      const sparked = ideas.filter(({ idea }) => idea.sourceProject === project.id)
      return {
        project,
        ideas: sparked.length,
        active: sparked.filter(({ status }) => status === 'active').length,
        done: sparked.filter(({ status }) => status === 'done').length,
      }
    })
    .sort((a, b) => b.ideas - a.ideas)
}

/** What an idea is about, as one tag per related project and Wiki page. */
function IdeaRelationTags({ idea, projectsById, pageTitles }: {
  idea: ResearchIdea
  projectsById: ReadonlyMap<string, ProjectSummary>
  pageTitles: ReadonlyMap<string, string>
}) {
  const m = useMessages()
  return (
    <>
      {(idea.relations?.projects ?? []).map((id) => (
        <Tag shape="chip" capped className="idea-relation-tag" key={id}>
          {m.ideas.link.project(projectsById.get(id)?.name ?? m.ideas.link.unavailable)}
        </Tag>
      ))}
      {(idea.relations?.pages ?? []).map((id) => (
        <Tag shape="chip" capped className="idea-relation-tag" key={id}>{m.ideas.relation.page(pageTitles.get(id) ?? id)}</Tag>
      ))}
    </>
  )
}

/**
 * Where an idea came from with the label of its kind, then, when `chatDeleted`, the tag saying the chat
 * it came from is deleted; an idea of the user's own from no project shows nothing.
 */
function IdeaOrigin({ idea, sourceProject, chatDeleted }: { idea: ResearchIdea; sourceProject: string | undefined; chatDeleted: boolean }) {
  const m = useMessages()
  if (ownIdea(idea) && sourceProject === undefined) return null
  return (
    <>
      <FadeText className="idea-card-source" label={m.project.idea.sourceTag(ideaSourceLabel(idea, sourceProject))}>
        <IdeaSource idea={idea} sourceProject={sourceProject} message={m.project.idea.sourceTag} />
      </FadeText>
      {idea.source.agent === true
        ? <AgentLabel className="idea-source-kind" />
        : ownIdea(idea) ? null : (
          <SourceLabel className="idea-source-kind">
            {idea.source.paperTitle === undefined ? m.ideas.sourceKind.chat : m.ideas.sourceKind.paperReading}
          </SourceLabel>
        )}
      {chatDeleted ? <SourceChatDeleted /> : null}
    </>
  )
}

/** The kept edit of an idea's body: the title and body typed, and those they were typed over, as older Apps keep it too. */
type IdeaEdit = { title: string; body: string; base: { title: string; body: string } }

/** The target an idea's edit is kept under, with its idea. */
const EDIT = 'edit'

/**
 * The edit of `idea`'s body (see `editText`), kept in `drafts` under EDIT in the shape older Apps
 * read; it is stale once the idea's body has changed since the edit started.
 */
function ideaBodyEdit(drafts: Drafts<IdeaEdit>, idea: ResearchIdea): TextEdit {
  const draft = drafts.get(EDIT)
  const fresh: IdeaEdit = { title: idea.title, body: idea.body, base: { title: idea.title, body: idea.body } }
  return {
    editing: draft !== undefined,
    text: draft?.body ?? idea.body,
    stale: draft !== undefined && draft.base.body !== idea.body,
    changed: draft !== undefined && draft.body !== draft.base.body,
    start: () => drafts.set(EDIT, fresh),
    change: (body) => drafts.set(EDIT, { ...(draft ?? fresh), body }),
    drop: () => drafts.drop(EDIT),
  }
}

/** The draft an idea's rename is kept under, with its idea, so it reopens where it was typed. */
const RENAME = 'rename'

/**
 * Idea cards share the project cards' row-end pattern: clicking the card opens its details, and
 * management actions sit in the "More" menu, which starts with Rename, opening the title in place
 * (see IdeaName). A title an older App kept in the idea's edit (see IdeaEdit) opens that rename.
 */
function IdeaMenu({ idea, linked, onMove, canMove, onArchive, onDelete }: {
  idea: ResearchIdea
  linked: ProjectSummary | undefined
  onMove: (by: -1 | 1) => void
  canMove: (by: -1 | 1) => boolean
  onArchive: () => void
  onDelete: () => void
}) {
  const m = useMessages()
  const names = useDrafts<string>(['idea', idea.id])
  const edits = useDrafts<IdeaEdit>(['idea', idea.id])
  const kept = edits.get(EDIT)
  // An older App kept a title typed in the detail panel in the idea's edit; it reopens as the rename it now is.
  useEffect(() => {
    if (kept === undefined || kept.title === kept.base.title) return
    if (names.get(RENAME) === undefined) names.set(RENAME, kept.title)
    if (kept.body === kept.base.body) edits.drop(EDIT)
    else edits.set(EDIT, { ...kept, title: kept.base.title })
  }, [kept, names, edits])
  const locked = idea.archived && linked?.status === FINISHED_PROJECT
  return (
    <DotsMenu label={m.ideas.manage(idea.title)} stopRowActivation onRename={() => names.set(RENAME, idea.title)}>
      <MenuItem disabled={!canMove(-1)} onSelect={() => onMove(-1)}>{m.common.moveUp}</MenuItem>
      <MenuItem disabled={!canMove(1)} onSelect={() => onMove(1)}>{m.common.moveDown}</MenuItem>
      <MenuSeparator />
      <MenuItem disabled={locked} onSelect={onArchive}>{idea.archived ? m.common.unarchive : m.common.archive}</MenuItem>
      <MenuSeparator />
      <MenuItem className="mi danger" onSelect={onDelete}>{m.common.delete}</MenuItem>
    </DotsMenu>
  )
}

/**
 * An idea's title on its card or row: `children`, the title that opens the idea, at rest, and while
 * the … menu's rename is open the title's inline field in their place, saved through `onRename`.
 */
function IdeaName({ idea, onRename, children }: {
  idea: ResearchIdea
  onRename: (title: string) => boolean | Promise<boolean>
  children: ReactNode
}) {
  const m = useMessages()
  return (
    <InlineField
      label={m.ideas.editor.titleLabel} value={idea.title} keep={{ scope: ['idea', idea.id], target: RENAME }}
      normalize={(next) => next.trim()} validate={(next) => next !== ''} onSave={onRename} rest={children} selectAll
    />
  )
}

/** An idea as a card, title first: what it relates to, then where it came from and when it last changed. */
function IdeaCard({ idea, chatDeleted, projectsById, pageTitles, selected, menu, onOpen, onRename, reorder }: {
  idea: ResearchIdea
  chatDeleted: boolean
  projectsById: ReadonlyMap<string, ProjectSummary>
  pageTitles: ReadonlyMap<string, string>
  selected: boolean
  menu: ReactNode
  onOpen: () => void
  onRename: (title: string) => Promise<boolean>
  reorder: Reorderable
}) {
  const m = useMessages()
  return (
    <Item
      density="card" className="idea-card" selected={selected} muted={idea.archived}
      data-idea={idea.id} onActivate={onOpen} {...reorder.item}
      title={(
        <>
          <IdeaName idea={idea} onRename={onRename}>
            <ItemOpen><FadeText className="idea-card-title" label={idea.title}>{idea.title}</FadeText></ItemOpen>
          </IdeaName>
          <IdeaRelationTags idea={idea} projectsById={projectsById} pageTitles={pageTitles} />
        </>
      )}
      meta={(
        <>
          <IdeaOrigin
            idea={idea} chatDeleted={chatDeleted}
            sourceProject={idea.sourceProject === undefined ? undefined : projectsById.get(idea.sourceProject)?.name}
          />
          <TrailingDate date={idea.updated} label={m.ideas.updated} />
        </>
      )}
      actions={<DragHandle {...reorder.handle} />} menu={menu}
    />
  )
}

/**
 * A started idea as a row: its title, the project it is carried out in, with that project's status tag
 * while it is shelved, and where it came from.
 */
function IdeaRow({ idea, chatDeleted, projectsById, selected, menu, onOpen, onRename, reorder }: {
  idea: ResearchIdea
  chatDeleted: boolean
  projectsById: ReadonlyMap<string, ProjectSummary>
  selected: boolean
  menu: ReactNode
  onOpen: () => void
  onRename: (title: string) => Promise<boolean>
  reorder: Reorderable
}) {
  const m = useMessages()
  const work = idea.project === undefined ? undefined : projectsById.get(idea.project)
  return (
    <Item
      composite className="idea-row" selected={selected} data-idea={idea.id} onActivate={onOpen} {...reorder.item}
      title={(
        <IdeaName idea={idea} onRename={onRename}>
          <ItemOpen className="idea-row-open"><FadeText className="idea-row-title" label={idea.title}>{idea.title}</FadeText></ItemOpen>
        </IdeaName>
      )}
      trailing={<TrailingDate date={idea.updated} label={m.ideas.updated} />}
      actions={<DragHandle {...reorder.handle} />} menu={menu}
    >
      <span className="idea-row-work">
        {work === undefined ? null : <ProjectLabel name={work.name} />}
        {work?.status === SHELVED_PROJECT ? <ProjectStatusTag status={work.status} /> : null}
      </span>
      <ItemMeta className="idea-row-meta">
        <IdeaOrigin
          idea={idea} chatDeleted={chatDeleted}
          sourceProject={idea.sourceProject === undefined ? undefined : projectsById.get(idea.sourceProject)?.name}
        />
      </ItemMeta>
    </Item>
  )
}

function IdeaDetailPanel({
  idea, sourceChatDeleted, linked, projects, pageTitles, candidate, onClose, onSave, onRelations, onProject, onPromote, onPlace,
  onOpen, onError,
}: {
  idea: ResearchIdea
  /** Whether the chat the idea came from is deleted. */
  sourceChatDeleted: boolean
  linked: ProjectSummary | undefined
  projects: ProjectSummary[]
  pageTitles: ReadonlyMap<string, string>
  /** The idea's candidate node as its source project's graph names it, while one is shown; null once that project is gone. */
  candidate: ComponentProps<typeof IdeaNodeCandidate>['node'] | undefined
  onClose: () => void
  onSave: (body: string) => Promise<boolean>
  onRelations: (relations: IdeaRelationsValue, removed?: string) => Promise<boolean>
  onProject: (projectId: string | null) => void
  onPromote: () => void
  onPlace: (kind: 'confirm' | 'dismiss') => void
  onOpen: (screen: 'project' | 'chat' | 'reader' | 'wiki', id: string) => void
  onError: (error: Error) => void
}) {
  const m = useMessages()
  const body = ideaBodyEdit(useDrafts<IdeaEdit>(['idea', idea.id]), idea)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setBusy(false) }, [idea.id])

  const save = (next: string) => {
    setBusy(true)
    void onSave(next).then((saved) => {
      setBusy(false)
      if (saved) body.drop()
    })
  }

  return (
    <SidePanel surface="card" label={m.ideas.detailHeading} className="idea-detail-panel">
      <IdeaPanel
        idea={idea} onClose={onClose} onOpenSourceChat={(chatId) => onOpen('chat', chatId)} sourceChatDeleted={sourceChatDeleted}
        sourceProject={idea.sourceProject === undefined ? undefined : projects.find((project) => project.id === idea.sourceProject)?.name}
        onOpenSourcePaper={(paperId) => onOpen('reader', paperId)}
        body={(
          <MarkdownSection
            key={idea.id} title={m.project.sections.content} level="group" className="idea-panel-body" edit={body}
            required saving={busy} onSave={save}
          />
        )}
      >
        <IdeaRelations
          idea={idea} projects={projects} pages={pageTitles} onChange={onRelations} onError={onError}
          onOpenProject={(projectId) => onOpen('project', projectId)} onOpenPage={(page) => onOpen('wiki', page)}
        />
        <SectionHeading
          level="group"
          actions={idea.project === undefined
            ? <Button size="compact" onClick={onPromote}>{m.ideas.promote.action}</Button>
            : linked === undefined
              ? undefined
              : <Button size="compact" onClick={() => onOpen('project', linked.id)}>{m.ideas.promote.openProject}</Button>}
        >{m.ideas.work.heading}
        </SectionHeading>
        <ChoicePicker
          appearance="field" className="idea-link-picker" aria-label={m.ideas.work.selectAriaLabel(idea.title)}
          value={idea.project ?? ''}
          options={[
            '',
            ...(idea.project !== undefined && linked === undefined ? [idea.project] : []),
            ...projects.map((project) => project.id),
          ]}
          label={(id) => {
            if (id === '') return m.ideas.work.none
            const project = projects.find((candidate) => candidate.id === id)
            return project === undefined ? m.ideas.link.originalUnavailable : `${project.name} · ${project.status}`
          }}
          onPick={(id) => onProject(id || null)}
        />
        {idea.project !== undefined && linked === undefined
          ? <InlineMessage tone="warning" variant="line" className="idea-missing-project">{m.ideas.link.originalUnavailable}</InlineMessage>
          : null}
        {candidate === undefined
          ? null
          : <IdeaNodeCandidate node={candidate} onConfirm={() => onPlace('confirm')} onDismiss={() => onPlace('dismiss')} />}
      </IdeaPanel>
    </SidePanel>
  )
}

export function Ideas() {
  const m = useMessages()
  const { revision } = useVaultRevision()
  const { jump, open: jumpTo } = useJump()
  const { origin, back } = useJumpOrigin()
  const write = useVaultWrite()
  const undo = useUndo()
  const consumedJump = useRef(0)
  const newIdea = useRef<HTMLButtonElement>(null)
  const draftTriggers = useMemo(() => [newIdea], [])
  const [rows, setRows] = useState<ResearchIdea[] | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [pageTitles, setPageTitles] = useState<ReadonlyMap<string, string>>(new Map())
  const chatDeleted = useSourceChatDeleted()
  const [candidateSource, setCandidateSource] = useState<ProjectDetail | 'gone' | null>(null)
  const [details, setDetails] = useState<ReadonlyMap<string, ProjectDetail>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  // The new idea's draft is kept as it is typed and opens again after a restart.
  const [draft, setDraft] = useDraft<IdeaDraftText>(['ideas'], 'new')
  const draftSlot = useDraftSlot(draft !== null, () => setDraft({ title: '', body: '' }))
  const { error, load, report } = useScreenLoad()
  const closeDetail = useCallback(() => setSelectedId(null), [])

  useEffect(() => {
    const read = Promise.all([ideaApi.list(), projectApi.list(), wikiApi.cards()]).then(async ([ideas, projectRows, cards]) => {
      // A node's state lives in its project's graph, so the projects holding an idea's node are read whole.
      // Each is read on its own: one that is gone or unreadable leaves its ideas without a project, and
      // any failure but a deleted project is also reported.
      const holding = [...new Set(ideas.flatMap((idea) => (idea.node === undefined || idea.project === undefined ? [] : [idea.project])))]
      const held = await Promise.all(holding.map((id) => projectApi.get(id).catch((cause: unknown) => {
        if (failureOf(cause) !== 'not-found') report(cause)
        return null
      })))
      return { ideas, projectRows, cards, held: held.filter((detail) => detail !== null) }
    })
    return load('ideas', read, ({ ideas, projectRows, cards, held }) => {
      setRows(ideas)
      setProjects(projectRows)
      setDetails(new Map(held.map((detail) => [detail.id, detail])))
      setPageTitles(new Map(cards.map((card) => [card.id, card.title])))
      setSelectedId((held) => held !== null && ideas.some((idea) => idea.id === held) ? held : null)
    })
  }, [load, report, revision])
  // Clicking the sidebar while this screen is shown lands on the plain list: an open detail closes.
  const body = useRef<HTMLDivElement>(null)
  const toList = useTopLevel(selectedId !== null, () => setSelectedId(null), body)
  const reentry = useScreenReentry()
  useEffect(toList, [reentry, toList])
  useEffect(() => {
    if (jump === null || jump.seq === consumedJump.current) return
    consumedJump.current = jump.seq
    if (jump.anchor?.newIdea === true) {
      if (draft === null) setDraft({ title: '', body: '' })
    } else setSelectedId(jump.target)
  }, [jump, draft, setDraft])
  useEscapeLayer(selectedId !== null, closeDetail)

  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )
  const listed = useMemo(() => rows ?? [], [rows])
  const selected = selectedId === null ? undefined : listed.find((idea) => idea.id === selectedId)
  // A candidate node is named in its source project's graph, read for the selected idea only.
  const candidateProject = selected?.candidateNode === undefined ? undefined : selected.sourceProject
  useEffect(() => {
    setCandidateSource(null)
    if (candidateProject === undefined) return
    // A deleted source project leaves the candidate in the missing-project state; any other failure stands.
    return load('candidate', projectApi.get(candidateProject).catch((cause: unknown) => {
      if (failureOf(cause) === 'not-found') return 'gone' as const
      throw cause
    }), setCandidateSource)
  }, [candidateProject, revision, load])
  const candidateNode = selected?.candidateNode === undefined || candidateSource === null || candidateSource === 'gone'
    || candidateSource.id !== candidateProject
    ? undefined
    : (candidateSource.workspace?.graph ?? candidateSource.graph).nodes.find((node) => node.id === selected.candidateNode)
  const current = listed.filter((idea) => !idea.archived)
  const statuses = useMemo(() => new Map(listed.map((idea) => [idea.id, ideaStatus(
    idea,
    idea.project === undefined ? undefined : projectsById.get(idea.project),
    idea.project === undefined ? undefined : details.get(idea.project),
  )])), [listed, projectsById, details])
  const statusOf = useCallback((id: string): IdeaStatus => statuses.get(id)!, [statuses])
  const inStatus = (status: IdeaStatus) => listed.filter((idea) => statusOf(idea.id) === status)
  const open = inStatus('open')
  const started = inStatus('active')
  const done = inStatus('done')
  const archived = inStatus('archived')
  const counts = ideasByProject(listed.map((idea) => ({ idea, status: statusOf(idea.id) })), projects)

  const ids = useMemo(() => listed.map((idea) => idea.id), [listed])
  const reorder = useDragReorder(ids, statusOf, (order) => { void write(ideaApi.reorder(order)) }, { axis: 'y', handle: 'grip' })
  const sortByUpdated = () => {
    const order = [...listed].sort((a, b) => b.updated.localeCompare(a.updated)).map((idea) => idea.id)
    void write(ideaApi.reorder(order))
  }

  const archive = (idea: ResearchIdea) => {
    void write(ideaApi.update(idea.id, { archived: !idea.archived }))
  }
  /** Creates the user's own idea; once written it takes the draft card's place and opens in the detail panel. */
  const createIdea = (title: string, body: string) => write(ideaApi.create(undefined, title, body).then((idea) => {
    setRows((held) => [idea, ...(held ?? [])])
    setSelectedId(idea.id)
    setDraft(null)
  }))
  const remove = (idea: ResearchIdea) => {
    void write(ideaApi.delete(idea.id), { note: m.common.trashed, action: (trashed) => undo.restore([trashed]) }).then((saved) => {
      if (!saved) return
      if (selectedId === idea.id) setSelectedId(null)
    })
  }
  const menuOf = (idea: ResearchIdea) => (
    <IdeaMenu
      idea={idea} linked={idea.project === undefined ? undefined : projectsById.get(idea.project)}
      onArchive={() => archive(idea)} onDelete={() => remove(idea)}
      onMove={(by) => reorder.move(idea.id, by)} canMove={(by) => reorder.canMove(idea.id, by)}
    />
  )
  /** The props an idea's card and row share besides its menu: its selection and its drag handles. */
  const shared = (idea: ResearchIdea) => ({
    idea, chatDeleted: chatDeleted(idea), projectsById, selected: selectedId === idea.id,
    onOpen: () => setSelectedId(idea.id),
    onRename: (title: string) => write(ideaApi.update(idea.id, { title })),
    reorder: { item: reorder.itemProps(idea.id), handle: reorder.handleProps(idea.id) },
  })
  const card = (idea: ResearchIdea) => <IdeaCard key={idea.id} {...shared(idea)} pageTitles={pageTitles} menu={menuOf(idea)} />
  const row = (idea: ResearchIdea) => <IdeaRow key={idea.id} {...shared(idea)} menu={menuOf(idea)} />
  /** A group's rows, or its placeholder while they load, or its empty state. */
  const groupRows = (ideas: ResearchIdea[]) => (rows === null
    ? (error === null ? <LoadingPlaceholder shape="rows" count={2} /> : null)
    : ideas.length === 0
      ? <EmptyState variant="section" />
      : <List variant="embedded" rows="all" className="idea-rows">{ideas.map(row)}</List>)
  const rowGroups = (
    <>
      {groupRows(started)}
      <Group title={m.ideas.groups.done} count={done.length}>{groupRows(done)}</Group>
    </>
  )
  const b = m.ideas.byProject

  return (
    <PageShell className="ideas-page">
      <PageHeader actions={(
        <>
          {current.length === 0
            ? null
            : <SortMenu label={m.ideas.sort} options={[{ label: m.ideas.sortUpdated, onSelect: sortByUpdated }]} />}
          <AddAction
            size="regular" ref={newIdea} onClick={draftSlot.start}
          >{m.ideas.create}</AddAction>
        </>
      )}
      >
        {origin === null ? null : <BackButton onClick={back} />}
        <PageTitle count={current.length}>{m.ideas.title}</PageTitle>
      </PageHeader>
      <PageError error={error} />
      <PageBody ref={body} className="ideas-body">
        <SplitPage columns="rail">
          <SplitColumn>
            <div className="ideas-list">
              <GroupedList>
                <Group title={m.ideas.groups.open} count={open.length}>
                  {draft === null
                    ? null
                    : (
                      <DraftSlot as="card" className="idea-draft-card" slot={draftSlot.slot}>
                        <IdeaDraft
                          draft={draft} triggers={draftTriggers} onChange={setDraft} onSave={createIdea} onCancel={() => setDraft(null)}
                        />
                      </DraftSlot>
                    )}
                  {rows === null ? (
                    error === null ? <LoadingPlaceholder shape="cards" /> : null
                  ) : open.length === 0
                    ? (draft === null ? <EmptyState variant="section" /> : null)
                    : open.map(card)}
                </Group>
                <Group title={m.ideas.groups.active} count={started.length}>
                  {/* Loaded rows of the started and the done group lay out on one grid, so their columns line up across both. */}
                  {rows === null ? rowGroups : <div className="idea-row-groups">{rowGroups}</div>}
                </Group>
                {archived.length === 0 ? null : (
                  <Group
                    title={m.common.archived} count={archived.length}
                    fold={{ open: archiveOpen || archived.some((idea) => idea.id === selectedId), onToggle: () => setArchiveOpen((held) => !held) }}
                  >
                    {archived.map(card)}
                  </Group>
                )}
              </GroupedList>

              {counts.every((count) => count.ideas === 0) ? null : (
                <>
                  <SectionHeading>{b.heading}</SectionHeading>
                  <Table
                    className="idea-stats" rows="capped"
                    columns={[
                      { key: 'project', label: '', name: m.research.list.title, width: STATS_NAME_WIDTH },
                      ...([['ideas', b.ideas], ['active', b.active], ['done', b.done]] as const)
                        .map(([key, label]) => ({ key, label, width: STATS_COUNT_WIDTH, align: 'end' as const })),
                    ]}
                  >
                    {counts.map(({ project, ideas, active, done: finished }) => (
                      <TableRow key={project.id} onClick={() => jumpTo('project', project.id)}>
                        <TableCell kind="title"><TableOpen>{project.name}</TableOpen></TableCell>
                        {[ideas, active, finished].map((count, i) => (
                          <TableCell align="end" kind={count === 0 ? 'meta' : undefined} key={i}>{count}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </Table>
                </>
              )}
            </div>
          </SplitColumn>

          {selected === undefined ? null : (
            <IdeaDetailPanel
              idea={selected}
              sourceChatDeleted={chatDeleted(selected)}
              linked={selected.project === undefined ? undefined : projectsById.get(selected.project)}
              projects={projects}
              pageTitles={pageTitles}
              candidate={candidateNode !== undefined
                ? { id: candidateNode.id, label: candidateNode.label, mode: nodeMode(candidateNode) }
                : candidateSource === 'gone' && selected.candidateNode !== undefined ? null : undefined}
              onClose={closeDetail}
              onRelations={(relations) => write(ideaApi.update(selected.id, { relations }))}
              onPlace={(kind) => void write(ideaApi.placeOnGraph(selected.id, { kind }))}
              onError={report}
              onSave={(body) => write(ideaApi.update(selected.id, { body }))}
              onProject={(projectId) => void write(ideaApi.update(selected.id, { project: projectId }))}
              onPromote={() => void write(ideaApi.promote(selected.id))}
              onOpen={jumpTo}
            />
          )}
        </SplitPage>
      </PageBody>
    </PageShell>
  )
}
