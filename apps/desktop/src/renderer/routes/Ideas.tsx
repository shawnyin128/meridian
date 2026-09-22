import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ProjectSummary, ResearchIdea } from '../../shared/contract.js'
import { FINISHED_PROJECT } from '../../shared/vocabulary.js'
import { idea as ideaApi, project as projectApi } from '../ipc.js'
import { MenuItem, MenuSeparator } from '../components/ActionMenu.js'
import { SortMenu } from '../components/SortMenu.js'
import { FormInput, FormSelect, FormTextarea } from '../components/FormControls.js'
import { DotsMenu } from '../components/FieldPickers.js'
import { EmptyState } from '../components/EmptyState.js'
import { PanelClose } from '../components/PanelClose.js'
import { DetailPanel } from '../components/DetailPanel.js'
import { ResearchObjectCard } from '../components/ResearchObjectCard.js'
import {
  PageBody, PageError, PageHeader, PageShell, PageTitle, SectionHeading,
} from '../components/PageShell.js'
import { useEscapeLayer, useJump, useScreenReentry, useVaultRevision } from '../shell/AppShell.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { useDragReorder, type DragCardProps } from '../hooks/useDragReorder.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import type { Catalog } from '../messages/catalog.js'
import './Ideas.css'

const sourceLabel = (idea: ResearchIdea) => idea.source.paperTitle === undefined
  ? idea.source.chatTitle
  : `${idea.source.paperTitle} · ${idea.source.chatTitle}`

const sourceKind = (idea: ResearchIdea, m: Catalog) => idea.source.agent === true
  ? m.ideas.sourceKind.agent
  : idea.source.paperTitle === undefined ? m.ideas.sourceKind.chat : m.ideas.sourceKind.paperReading

function linkedProjectLabel(idea: ResearchIdea, linked: ProjectSummary | undefined, m: Catalog): string {
  if (idea.project === undefined) return m.ideas.link.none
  return linked === undefined ? m.ideas.link.unavailable : m.ideas.link.project(linked.name)
}

/** Idea cards and project cards share the same end-of-line management language: the card itself is responsible for entering details, and management actions are collected in "More". */
function IdeaMenu({ idea, linked, onArchive, onDelete }: {
  idea: ResearchIdea
  linked: ProjectSummary | undefined
  onArchive: () => void
  onDelete: () => void
}) {
  const m = useMessages()
  const locked = idea.archived && linked?.status === FINISHED_PROJECT
  return (
    <DotsMenu label={m.ideas.manage(idea.title)} stopRowActivation>
      <MenuItem
        disabled={locked}
        title={locked ? m.ideas.archiveLockedHint : undefined}
        onSelect={onArchive}
      >{idea.archived ? m.common.unarchive : m.common.archive}</MenuItem>
      <MenuSeparator />
      <MenuItem className="mi danger" onSelect={onDelete}>{m.common.delete}</MenuItem>
    </DotsMenu>
  )
}

function IdeaCard({ idea, linked, selected, menu, onOpen, dragProps, dropClassName }: {
  idea: ResearchIdea
  linked: ProjectSummary | undefined
  selected: boolean
  menu: ReactNode
  onOpen: () => void
  dragProps: DragCardProps
  dropClassName: string
}) {
  const fmt = useFormat()
  const m = useMessages()
  return (
    <ResearchObjectCard
      className={`idea-card${dropClassName ? ` ${dropClassName}` : ''}`} selected={selected} muted={idea.archived}
      data-idea={idea.id} aria-label={m.ideas.view(idea.title)} onActivate={onOpen} {...dragProps}
    >
      <div className="idea-card-content">
        <div className="idea-card-title-row">
          <strong>{idea.title}</strong>
          <span className={`idea-project-tag${linked === undefined ? ' unlinked' : ''}${idea.project !== undefined && linked === undefined ? ' missing' : ''}`}>
            {linkedProjectLabel(idea, linked, m)}
          </span>
        </div>
        <p className="idea-card-summary">{idea.body}</p>
        <div className="idea-card-meta">
          <span className="idea-source-kind">{sourceKind(idea, m)}</span>
          <span className="idea-card-source" title={sourceLabel(idea)}>{m.project.idea.sourceTag(sourceLabel(idea))}</span>
          <span className="idea-card-updated">{m.ideas.updated(fmt.date(idea.updated))}</span>
        </div>
      </div>
      {menu}
    </ResearchObjectCard>
  )
}

function IdeaDetailPanel({ idea, linked, projects, onClose, onSave, onProject, onPromote, onOpen }: {
  idea: ResearchIdea
  linked: ProjectSummary | undefined
  projects: ProjectSummary[]
  onClose: () => void
  onSave: (title: string, body: string) => Promise<boolean>
  onProject: (projectId: string | null) => void
  onPromote: () => void
  onOpen: (screen: 'project' | 'chat', id: string) => void
}) {
  const fmt = useFormat()
  const m = useMessages()
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

  return (
    <aside className="idea-detail-panel" aria-label={m.ideas.detailHeading}>
      <header className="idea-detail-head">
        <span>{m.ideas.detailHeading}</span>
        {editing ? null : <button className="btn plain" onClick={startEditing}>{m.common.edit}</button>}
        <PanelClose onClose={onClose} />
      </header>

      {editing
        ? (
          <section className="idea-detail-editor">
            <label>
              <span>{m.ideas.editor.titleLabel}</span>
              <FormInput
                autoFocus value={title} maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              <span>{m.ideas.bodyLabel}</span>
              <FormTextarea
                value={body} maxLength={20_000}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            <div className="idea-detail-editor-actions">
              <button className="btn" disabled={busy} onClick={cancelEditing}>{m.common.cancel}</button>
              <button
                className="btn pri" disabled={busy || title.trim() === '' || body.trim() === ''}
                onClick={save}
              >{busy ? m.ideas.saving : m.common.save}</button>
            </div>
          </section>
        )
        : (
          <>
            <div className="idea-detail-title-row">
              <h2>{idea.title}</h2>
              {idea.archived ? <span className="idea-archive-tag">{m.common.archived}</span> : null}
            </div>
            <section className="idea-detail-section">
              <h3>{m.ideas.bodyLabel}</h3>
              <p className="idea-detail-body">{idea.body}</p>
            </section>
          </>
        )}

      <section className="idea-detail-section">
        <h3>{m.ideas.link.heading}</h3>
        <FormSelect
          aria-label={m.ideas.link.selectAriaLabel(idea.title)} value={idea.project ?? ''}
          onChange={(event) => onProject(event.target.value || null)}
        >
          <option value="">{m.ideas.link.none}</option>
          {idea.project !== undefined && linked === undefined
            ? <option value={idea.project}>{m.ideas.link.originalUnavailable}</option>
            : null}
          {projects.map((project) => (
            <option value={project.id} key={project.id}>{project.name} · {project.status}</option>
          ))}
        </FormSelect>
        <div className="idea-detail-actions">
          {idea.project === undefined
            ? <button className="btn" onClick={onPromote}>{m.ideas.promote.action}</button>
            : linked === undefined
              ? <span className="idea-missing-project">{m.ideas.link.originalUnavailable}</span>
              : <button className="btn" onClick={() => onOpen('project', linked.id)}>{m.ideas.promote.openProject}</button>}
        </div>
      </section>

      <section className="idea-detail-section idea-detail-source">
        <h3>{m.project.sections.source}</h3>
        <p>{sourceLabel(idea)}</p>
        <div className="idea-detail-meta">{m.common.updatedOn(fmt.date(idea.updated))}</div>
        {idea.source.chatId === undefined
          ? null
          : <button className="btn" onClick={() => onOpen('chat', idea.source.chatId!)}>{m.ideas.openSourceChat}</button>}
      </section>
    </aside>
  )
}

export function Ideas() {
  const m = useMessages()
  const { revision } = useVaultRevision()
  const { jump, open } = useJump()
  const write = useVaultWrite()
  const consumedJump = useRef(0)
  const [rows, setRows] = useState<ResearchIdea[]>([])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const closeDetail = useCallback(() => setSelectedId(null), [])

  const load = useCallback(() => {
    void Promise.all([ideaApi.list(), projectApi.list()]).then(([ideas, projectRows]) => {
      setRows(ideas)
      setProjects(projectRows)
      setSelectedId((held) => held !== null && ideas.some((idea) => idea.id === held) ? held : null)
      setError(null)
    }).catch((cause: Error) => setError(cause.message))
  }, [])
  useEffect(load, [load, revision])
  // Clicking the sidebar while this screen is shown lands on the plain list: an open detail closes.
  const reentry = useScreenReentry()
  useEffect(() => { setSelectedId(null) }, [reentry])
  useEffect(() => {
    if (jump === null || jump.seq === consumedJump.current) return
    consumedJump.current = jump.seq
    setSelectedId(jump.target)
  }, [jump])
  useEscapeLayer(selectedId !== null, closeDetail)

  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )
  const selected = selectedId === null ? undefined : rows.find((idea) => idea.id === selectedId)
  const active = rows.filter((idea) => !idea.archived)
  const archived = rows.filter((idea) => idea.archived)

  const ids = useMemo(() => rows.map((idea) => idea.id), [rows])
  const archivedOf = useMemo(() => new Map(rows.map((idea) => [idea.id, idea.archived])), [rows])
  const reorder = useDragReorder(
    ids, (id) => (archivedOf.get(id) ? 'archived' : 'active'),
    (order) => { void write(ideaApi.reorder(order)) },
  )
  const sortByUpdated = () => {
    const order = [...rows].sort((a, b) => b.updated.localeCompare(a.updated)).map((idea) => idea.id)
    void write(ideaApi.reorder(order))
  }

  const archive = (idea: ResearchIdea) => {
    void write(
      ideaApi.update(idea.id, { archived: !idea.archived }),
      { note: idea.archived ? m.ideas.restoredNote : m.ideas.archivedNote },
    )
  }
  const remove = (idea: ResearchIdea) => {
    void write(ideaApi.delete(idea.id), { note: m.common.trashed }).then((saved) => {
      if (!saved) return
      if (selectedId === idea.id) setSelectedId(null)
    })
  }
  const card = (idea: ResearchIdea) => {
    const linked = idea.project === undefined ? undefined : projectsById.get(idea.project)
    return (
      <IdeaCard
        idea={idea} linked={linked} selected={selectedId === idea.id} key={idea.id}
        onOpen={() => setSelectedId(idea.id)}
        menu={<IdeaMenu idea={idea} linked={linked} onArchive={() => archive(idea)} onDelete={() => remove(idea)} />}
        dragProps={reorder.cardProps(idea.id)} dropClassName={reorder.dropClass(idea.id)}
      />
    )
  }

  return (
    <PageShell className="ideas-page">
      <PageHeader><PageTitle>{m.ideas.title(active.length)}</PageTitle></PageHeader>
      <PageError error={error} />
      <PageBody className="ideas-body">
        <div className={`ideas-workspace${selected === undefined ? '' : ' has-detail'}`}>
          <main className="ideas-list">
            <SectionHeading actions={active.length === 0 ? undefined : (
              <SortMenu label={m.ideas.sort} options={[{ label: m.ideas.sortUpdated, onSelect: sortByUpdated }]} />
            )}
            >{m.ideas.activeHeading(active.length)}</SectionHeading>
            {active.length === 0 ? (
              <EmptyState variant="page">
                {m.ideas.empty}
              </EmptyState>
            ) : active.map(card)}
            {archived.length === 0 ? null : (
              <>
                <SectionHeading>{m.ideas.archivedHeading(archived.length)}</SectionHeading>
                {archived.map(card)}
              </>
            )}
          </main>

          <DetailPanel open={selected !== undefined} mode="inline" className="idea-detail-slot">
            {selected === undefined ? null : (
              <IdeaDetailPanel
                idea={selected}
                linked={selected.project === undefined ? undefined : projectsById.get(selected.project)}
                projects={projects}
                onClose={closeDetail}
                onSave={(title, body) => write(
                  ideaApi.update(selected.id, { title, body }), { note: m.ideas.updatedNote },
                )}
                onProject={(projectId) => void write(
                  ideaApi.update(selected.id, { project: projectId }),
                  { note: projectId === null ? m.ideas.link.cleared : m.ideas.link.linked },
                )}
                onPromote={() => void write(
                  ideaApi.promote(selected.id), { note: m.ideas.promote.createdNote },
                )}
                onOpen={open}
              />
            )}
          </DetailPanel>
        </div>
      </PageBody>
    </PageShell>
  )
}
