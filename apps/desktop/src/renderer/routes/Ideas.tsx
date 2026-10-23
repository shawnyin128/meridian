import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { ComponentProps } from 'react'
import type {
  IdeaRelations as IdeaRelationsValue, ProjectDetail, ProjectSummary, ResearchIdea,
} from '../../shared/contract.js'
import { FINISHED_PROJECT, SHELVED_PROJECT } from '../../shared/vocabulary.js'
import { idea as ideaApi, project as projectApi, wiki as wikiApi } from '../ipc.js'
import { MenuItem, MenuSeparator } from '../components/ActionMenu.js'
import { SortMenu } from '../components/SortMenu.js'
import { FormInput, FormTextarea } from '../components/FormControls.js'
import { ChoicePicker, DotsMenu } from '../components/FieldPickers.js'
import { EditActions } from '../components/EditActions.js'
import { CollapsibleGroup } from '../components/CollapsibleGroup.js'
import { EmptyState } from '../components/EmptyState.js'
import { AddAction } from '../components/AddAction.js'
import { IdeaDraft, type IdeaDraftText } from '../components/ideas/IdeaDraft.js'
import { IdeaPanel, IdeaSource, ideaSourceLabel, ownIdea } from '../components/ideas/IdeaPanel.js'
import { IdeaNodeCandidate } from '../components/ideas/IdeaNodeCandidate.js'
import { IdeaRelations } from '../components/ideas/IdeaRelations.js'
import { nodeMode } from '../components/project/ResearchGraph.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { DetailPanel } from '../components/DetailPanel.js'
import { CardOpen, ResearchObjectCard } from '../components/ResearchObjectCard.js'
import { RowActions, StructuredList, StructuredRow } from '../components/StructuredList.js'
import { ProjectLabel, ProjectStatusTag } from '../components/project/ProjectIdentity.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { errorLabel } from '../lib/failure-label.js'
import { useEscapeLayer, useJump, useScreenReentry, useVaultRevision } from '../shell/AppShell.js'
import { BackButton } from '../components/BackButton.js'
import { TitleNote } from '../components/TitleNote.js'
import { useJumpOrigin } from '../hooks/useJumpOrigin.js'
import { useUndo } from '../hooks/useUndo.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { useDragReorder, type Reorderable } from '../hooks/useDragReorder.js'
import { DragHandle } from '../components/DragHandle.js'
import { useFormat } from '../lib/format.js'
import { commitsMultiline, composing } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import { AgentLabel, SourceLabel } from '../components/SourceLabel.js'
import { Tag } from '../components/Tag.js'
import { FadeText } from '../components/FadeText.js'
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
        <Tag shape="chip" className="idea-relation-tag" key={id}>
          {m.ideas.link.project(projectsById.get(id)?.name ?? m.ideas.link.unavailable)}
        </Tag>
      ))}
      {(idea.relations?.pages ?? []).map((id) => (
        <Tag shape="chip" className="idea-relation-tag" key={id}>{m.ideas.relation.page(pageTitles.get(id) ?? id)}</Tag>
      ))}
    </>
  )
}

/** Where an idea came from with the label of its kind; an idea of the user's own from no project shows nothing. */
function IdeaOrigin({ idea, sourceProject }: { idea: ResearchIdea; sourceProject: string | undefined }) {
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
    </>
  )
}

/**
 * Idea cards share the project cards' row-end pattern: clicking the card opens its details, and
 * management actions sit in the "More" menu.
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
  const locked = idea.archived && linked?.status === FINISHED_PROJECT
  return (
    <DotsMenu label={m.ideas.manage(idea.title)} stopRowActivation>
      <MenuItem disabled={!canMove(-1)} onSelect={() => onMove(-1)}>{m.common.moveUp}</MenuItem>
      <MenuItem disabled={!canMove(1)} onSelect={() => onMove(1)}>{m.common.moveDown}</MenuItem>
      <MenuSeparator />
      <MenuItem disabled={locked} onSelect={onArchive}>
        {idea.archived ? m.common.unarchive : m.common.archive}
        {locked ? <span className="mi-key">{m.ideas.projectFinished}</span> : null}
      </MenuItem>
      <MenuSeparator />
      <MenuItem className="mi danger" onSelect={onDelete}>{m.common.delete}</MenuItem>
    </DotsMenu>
  )
}

/** An idea as a card, title first: what it relates to, then where it came from and when it last changed. */
function IdeaCard({ idea, projectsById, pageTitles, selected, menu, onOpen, reorder, dropClassName }: {
  idea: ResearchIdea
  projectsById: ReadonlyMap<string, ProjectSummary>
  pageTitles: ReadonlyMap<string, string>
  selected: boolean
  menu: ReactNode
  onOpen: () => void
  reorder: Reorderable
  dropClassName: string
}) {
  const fmt = useFormat()
  const m = useMessages()
  return (
    <ResearchObjectCard
      className={`idea-card${dropClassName ? ` ${dropClassName}` : ''}`} selected={selected} muted={idea.archived}
      data-idea={idea.id} onActivate={onOpen} {...reorder.item}
    >
      <div className="idea-card-content">
        <div className="idea-card-title-row">
          <CardOpen><FadeText className="idea-card-title" label={idea.title}>{idea.title}</FadeText></CardOpen>
          <IdeaRelationTags idea={idea} projectsById={projectsById} pageTitles={pageTitles} />
        </div>
        <div className="idea-card-meta">
          <IdeaOrigin idea={idea} sourceProject={idea.sourceProject === undefined ? undefined : projectsById.get(idea.sourceProject)?.name} />
          <span className="idea-card-updated">{m.ideas.updated(fmt.date(idea.updated))}</span>
        </div>
      </div>
      <RowActions><DragHandle {...reorder.handle} />{menu}</RowActions>
    </ResearchObjectCard>
  )
}

/**
 * A started idea as a row: its title, the project it is carried out in, with that project's status tag
 * while it is shelved, and where it came from.
 */
function IdeaRow({ idea, projectsById, selected, menu, onOpen, reorder, dropClassName }: {
  idea: ResearchIdea
  projectsById: ReadonlyMap<string, ProjectSummary>
  selected: boolean
  menu: ReactNode
  onOpen: () => void
  reorder: Reorderable
  dropClassName: string
}) {
  const fmt = useFormat()
  const m = useMessages()
  const work = idea.project === undefined ? undefined : projectsById.get(idea.project)
  return (
    <StructuredRow
      composite className={`idea-row${dropClassName ? ` ${dropClassName}` : ''}`} selected={selected}
      data-idea={idea.id} onActivate={onOpen} {...reorder.item}
    >
      <button type="button" className="idea-row-open"><FadeText className="idea-row-title" label={idea.title}>{idea.title}</FadeText></button>
      <span className="idea-row-work">
        {work === undefined ? null : <ProjectLabel name={work.name} />}
        {work?.status === SHELVED_PROJECT ? <ProjectStatusTag status={work.status} /> : null}
      </span>
      <span className="idea-row-meta">
        <IdeaOrigin idea={idea} sourceProject={idea.sourceProject === undefined ? undefined : projectsById.get(idea.sourceProject)?.name} />
      </span>
      <span className="idea-card-updated">{m.ideas.updated(fmt.date(idea.updated))}</span>
      <RowActions><DragHandle {...reorder.handle} />{menu}</RowActions>
    </StructuredRow>
  )
}

function IdeaDetailPanel({
  idea, linked, projects, pageTitles, candidate, onClose, onSave, onRelations, onProject, onPromote, onPlace, onOpen, onError,
}: {
  idea: ResearchIdea
  linked: ProjectSummary | undefined
  projects: ProjectSummary[]
  pageTitles: ReadonlyMap<string, string>
  /** The idea's candidate node as its source project's graph names it, while one is shown. */
  candidate: ComponentProps<typeof IdeaNodeCandidate>['node'] | undefined
  onClose: () => void
  onSave: (title: string, body: string) => Promise<boolean>
  onRelations: (relations: IdeaRelationsValue, removed?: string) => Promise<boolean>
  onProject: (projectId: string | null) => void
  onPromote: () => void
  onPlace: (kind: 'confirm' | 'dismiss') => void
  onOpen: (screen: 'project' | 'chat' | 'reader' | 'wiki', id: string) => void
  onError: (error: Error) => void
}) {
  const m = useMessages()
  const panelFade = useScrollFade('y')
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(idea.title)
  const [body, setBody] = useState(idea.body)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setEditing(false)
    setTitle(idea.title)
    setBody(idea.body)
    setBusy(false)
  }, [idea.id, idea.title, idea.body])

  const startEditing = () => {
    setTitle(idea.title)
    setBody(idea.body)
    setEditing(true)
  }
  const cancelEditing = () => {
    setTitle(idea.title)
    setBody(idea.body)
    setEditing(false)
  }
  const save = () => {
    const nextTitle = title.trim()
    const nextBody = body.trim()
    if (busy || nextTitle === '' || nextBody === '') return
    setBusy(true)
    void onSave(nextTitle, nextBody).then((saved) => {
      setBusy(false)
      if (saved) setEditing(false)
    })
  }
  /** Enter commits the title, ⌘Enter or Ctrl+Enter the body, and Escape restores both. */
  const commitOrCancel = (multiline: boolean) => (event: KeyboardEvent<HTMLElement>) => {
    if (composing(event.nativeEvent)) return
    if (event.key === 'Escape') { event.stopPropagation(); cancelEditing(); return }
    if (multiline ? commitsMultiline(event.nativeEvent) : event.key === 'Enter') { event.preventDefault(); save() }
  }

  return (
    <aside className="idea-detail-panel node-document-pane" ref={panelFade} data-fade-paint="" aria-label={m.ideas.detailHeading}>
      <IdeaPanel
        idea={idea} onClose={onClose} onOpenSourceChat={(chatId) => onOpen('chat', chatId)}
        sourceProject={idea.sourceProject === undefined ? undefined : projects.find((project) => project.id === idea.sourceProject)?.name}
        onOpenSourcePaper={(paperId) => onOpen('reader', paperId)}
        actions={(
          <EditActions
            editing={editing} saving={busy} canSave={title.trim() !== '' && body.trim() !== ''}
            onEdit={startEditing} onCancel={cancelEditing} onSave={save}
          />
        )}
        editor={editing
          ? (
            <section className="idea-detail-editor">
              <label>
                <span>{m.ideas.editor.titleLabel}</span>
                <FormInput
                  autoFocus value={title} maxLength={160}
                  onChange={(event) => setTitle(event.target.value)} onKeyDown={commitOrCancel(false)}
                />
              </label>
              <label>
                <span>{m.ideas.bodyLabel}</span>
                <FormTextarea
                  value={body} maxLength={20_000}
                  onChange={(event) => setBody(event.target.value)} onKeyDown={commitOrCancel(true)}
                />
              </label>
            </section>
          )
          : undefined}
      >
        <IdeaRelations
          idea={idea} projects={projects} pages={pageTitles} onChange={onRelations} onError={onError}
          onOpenProject={(projectId) => onOpen('project', projectId)} onOpenPage={(page) => onOpen('wiki', page)}
        />
        <SectionHeading
          variant="rail"
          actions={idea.project === undefined
            ? <button className="btn sm" onClick={onPromote}>{m.ideas.promote.action}</button>
            : linked === undefined
              ? undefined
              : <button className="btn sm" onClick={() => onOpen('project', linked.id)}>{m.ideas.promote.openProject}</button>}
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
          ? <div className="idea-missing-project">{m.ideas.link.originalUnavailable}</div>
          : null}
        {candidate === undefined
          ? null
          : <IdeaNodeCandidate node={candidate} onConfirm={() => onPlace('confirm')} onDismiss={() => onPlace('dismiss')} />}
      </IdeaPanel>
    </aside>
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
  const draftCard = useRef<HTMLElement>(null)
  const newIdea = useRef<HTMLButtonElement>(null)
  const draftTriggers = useMemo(() => [newIdea], [])
  const [rows, setRows] = useState<ResearchIdea[] | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [pageTitles, setPageTitles] = useState<ReadonlyMap<string, string>>(new Map())
  const [candidateSource, setCandidateSource] = useState<ProjectDetail | null>(null)
  const [details, setDetails] = useState<ReadonlyMap<string, ProjectDetail>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [draft, setDraft] = useState<IdeaDraftText | null>(null)
  const [error, setError] = useState<string | null>(null)
  const closeDetail = useCallback(() => setSelectedId(null), [])

  const load = useCallback(() => {
    void Promise.all([ideaApi.list(), projectApi.list(), wikiApi.cards()]).then(async ([ideas, projectRows, cards]) => {
      // A node's state lives in its project's graph, so the projects holding an idea's node are read whole.
      const holding = [...new Set(ideas.flatMap((idea) => (idea.node === undefined || idea.project === undefined ? [] : [idea.project])))]
      const held = await Promise.all(holding.map((id) => projectApi.get(id)))
      setRows(ideas)
      setProjects(projectRows)
      setDetails(new Map(held.map((detail) => [detail.id, detail])))
      setPageTitles(new Map(cards.map((card) => [card.id, card.title])))
      setSelectedId((held) => held !== null && ideas.some((idea) => idea.id === held) ? held : null)
      setError(null)
    }).catch((cause: unknown) => setError(errorLabel(m, cause)))
  }, [])
  useEffect(load, [load, revision])
  // Clicking the sidebar while this screen is shown lands on the plain list: an open detail closes.
  const reentry = useScreenReentry()
  useEffect(() => { setSelectedId(null) }, [reentry])
  useEffect(() => {
    if (jump === null || jump.seq === consumedJump.current) return
    consumedJump.current = jump.seq
    if (jump.anchor?.newIdea === true) setDraft((held) => held ?? { title: '', body: '' })
    else setSelectedId(jump.target)
  }, [jump])
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
    void projectApi.get(candidateProject).then(setCandidateSource).catch((cause: unknown) => setError(errorLabel(m, cause)))
  }, [candidateProject, revision, m])
  const candidateNode = selected?.candidateNode === undefined || candidateSource === null || candidateSource.id !== candidateProject
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
  const reorder = useDragReorder(ids, statusOf, (order) => { void write(ideaApi.reorder(order)) })
  const sortByUpdated = () => {
    const order = [...listed].sort((a, b) => b.updated.localeCompare(a.updated)).map((idea) => idea.id)
    void write(ideaApi.reorder(order))
  }

  const archive = (idea: ResearchIdea) => {
    void write(
      ideaApi.update(idea.id, { archived: !idea.archived }),
      { note: idea.archived ? m.ideas.restoredNote : m.ideas.archivedNote },
    )
  }
  /** Creates the user's own idea; once written it takes the draft card's place and opens in the detail panel. */
  const createIdea = (title: string, body: string) => write(ideaApi.create(undefined, title, body).then((idea) => {
    setRows((held) => [idea, ...(held ?? [])])
    setSelectedId(idea.id)
    setDraft(null)
  }), { note: m.chat.ideaSavedNote })
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
    idea, projectsById, selected: selectedId === idea.id,
    onOpen: () => setSelectedId(idea.id),
    reorder: { item: reorder.itemProps(idea.id), handle: reorder.handleProps(idea.id) },
    dropClassName: reorder.dropClass(idea.id),
  })
  const card = (idea: ResearchIdea) => <IdeaCard key={idea.id} {...shared(idea)} pageTitles={pageTitles} menu={menuOf(idea)} />
  const row = (idea: ResearchIdea) => <IdeaRow key={idea.id} {...shared(idea)} menu={menuOf(idea)} />
  const rowGroup = (heading: string, ideas: ResearchIdea[], empty: string) => (
    <>
      <SectionHeading>{heading}</SectionHeading>
      {rows === null
        ? (error === null ? <LoadingPlaceholder shape="rows" count={2} /> : null)
        : ideas.length === 0
          ? <EmptyState variant="section">{empty}</EmptyState>
          : <StructuredList variant="embedded" maxVisibleRows="all">{ideas.map(row)}</StructuredList>}
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
            variant="page" ref={newIdea}
            onClick={() => {
              // An open draft is only refocused, keeping what is typed.
              if (draft !== null) draftCard.current?.querySelector<HTMLElement>('.form-control')?.focus()
              else setDraft({ title: '', body: '' })
            }}
          >{m.ideas.create}</AddAction>
        </>
      )}
      >
        {origin === null ? null : <BackButton onClick={back} />}
        <PageTitle>{m.ideas.title(current.length)}</PageTitle>
      </PageHeader>
      <PageError error={error} />
      <PageBody className="ideas-body">
        <div className={`ideas-workspace${selected === undefined ? '' : ' has-detail'}`}>
          <main className="ideas-list">
            <SectionHeading>{m.ideas.groups.open(open.length)}</SectionHeading>
            {draft === null
              ? null
              : (
                <ResearchObjectCard className="idea-draft-card" cardRef={draftCard}>
                  <IdeaDraft
                    draft={draft} triggers={draftTriggers} onChange={setDraft} onSave={createIdea} onCancel={() => setDraft(null)}
                  />
                </ResearchObjectCard>
              )}
            {rows === null ? (
              error === null ? <LoadingPlaceholder shape="cards" /> : null
            ) : open.length === 0
              ? (draft === null ? <EmptyState variant="section">{m.ideas.emptyGroup.open}</EmptyState> : null)
              : open.map(card)}
            {rowGroup(m.ideas.groups.active(started.length), started, m.ideas.emptyGroup.active)}
            {rowGroup(m.ideas.groups.done(done.length), done, m.ideas.emptyGroup.done)}
            {archived.length === 0 ? null : (
              <CollapsibleGroup
                variant="quiet" title={m.common.archived} count={archived.length}
                open={archiveOpen || archived.some((idea) => idea.id === selectedId)}
                onToggle={() => setArchiveOpen((held) => !held)}
              >
                {archived.map(card)}
              </CollapsibleGroup>
            )}

            {counts.every((count) => count.ideas === 0) ? null : (
              <>
                <SectionHeading>{b.heading}</SectionHeading>
                <div className="idea-stats-head" aria-hidden="true">
                  <span /><span>{b.ideas}</span><span>{b.active}</span><span>{b.done}</span>
                </div>
                <StructuredList variant="embedded" className="idea-stats">
                  {counts.map(({ project, ideas, active, done: finished }) => (
                    <StructuredRow
                      className="idea-stats-row" key={project.id}
                      onActivate={() => jumpTo('project', project.id)}
                    >
                      <FadeText className="idea-stats-name" label={project.name}>{project.name}</FadeText>
                      {[[b.ideas, ideas], [b.active, active], [b.done, finished]].map(([label, count]) => (
                        <span className={`idea-stats-n${count === 0 ? ' zero' : ''}`} aria-label={`${label} ${count}`} key={label}>{count}</span>
                      ))}
                    </StructuredRow>
                  ))}
                </StructuredList>
              </>
            )}
          </main>

          <DetailPanel open={selected !== undefined} mode="inline" className="idea-detail-slot">
            {selected === undefined ? null : (
              <IdeaDetailPanel
                idea={selected}
                linked={selected.project === undefined ? undefined : projectsById.get(selected.project)}
                projects={projects}
                pageTitles={pageTitles}
                candidate={candidateNode === undefined ? undefined : { id: candidateNode.id, label: candidateNode.label, mode: nodeMode(candidateNode) }}
                onClose={closeDetail}
                onRelations={(relations, removed) => write(ideaApi.update(selected.id, { relations }), {
                  note: removed === undefined ? m.project.links.added : <TitleNote message={m.project.links.removed} title={removed} />,
                })}
                onPlace={(kind) => void write(ideaApi.placeOnGraph(selected.id, { kind }), {
                  note: kind === 'confirm' ? m.ideas.candidate.confirmed : m.ideas.candidate.dismissed,
                })}
                onError={(cause) => setError(errorLabel(m, cause))}
                onSave={(title, body) => write(
                  ideaApi.update(selected.id, { title, body }), { note: m.ideas.updatedNote },
                )}
                onProject={(projectId) => void write(
                  ideaApi.update(selected.id, { project: projectId }),
                  { note: projectId === null ? m.ideas.work.cleared : m.ideas.work.placed },
                )}
                onPromote={() => void write(
                  ideaApi.promote(selected.id), { note: m.ideas.promote.createdNote },
                )}
                onOpen={jumpTo}
              />
            )}
          </DetailPanel>
        </div>
      </PageBody>
    </PageShell>
  )
}
