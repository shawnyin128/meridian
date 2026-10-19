import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { ProjectSummary, ResearchIdea } from '../../shared/contract.js'
import { FINISHED_PROJECT } from '../../shared/vocabulary.js'
import { idea as ideaApi, project as projectApi } from '../ipc.js'
import { MenuItem, MenuSeparator } from '../components/ActionMenu.js'
import { SortMenu } from '../components/SortMenu.js'
import { FormInput, FormTextarea } from '../components/FormControls.js'
import { ChoicePicker, DotsMenu } from '../components/FieldPickers.js'
import { EditActions } from '../components/EditActions.js'
import { CollapsibleGroup } from '../components/CollapsibleGroup.js'
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
import { commitsMultiline, composing } from '../lib/keyboard.js'
import { useMessages } from '../messages/useMessages.js'
import type { Catalog } from '../messages/catalog.js'
import { plainTitle } from '../components/paper/paper-text.js'
import { AgentLabel, SourceLabel } from '../components/SourceLabel.js'
import { Tag } from '../components/Tag.js'
import './Ideas.css'

const sourceLabel = (idea: ResearchIdea) => idea.source.paperTitle === undefined
  ? plainTitle(idea.source.chatTitle)
  : `${plainTitle(idea.source.paperTitle)} · ${plainTitle(idea.source.chatTitle)}`


function linkedProjectLabel(idea: ResearchIdea, linked: ProjectSummary | undefined, m: Catalog): string {
  if (idea.project === undefined) return m.ideas.link.none
  return linked === undefined ? m.ideas.link.unavailable : m.ideas.link.project(linked.name)
}

/**
 * Idea cards share the project cards' row-end pattern: clicking the card opens its details, and
 * management actions sit in the "More" menu.
 */
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
          <Tag
            tone={linked !== undefined ? 'accent' : idea.project === undefined ? 'neutral' : 'bad'}
            className="idea-project-tag"
          >{linkedProjectLabel(idea, linked, m)}</Tag>
        </div>
        <p className="idea-card-summary">{idea.body}</p>
        <div className="idea-card-meta">
          <span className="idea-card-source" title={sourceLabel(idea)}>{m.project.idea.sourceTag(sourceLabel(idea))}</span>
          {idea.source.agent === true
            ? <AgentLabel className="idea-source-kind" />
            : (
              <SourceLabel className="idea-source-kind">
                {idea.source.paperTitle === undefined ? m.ideas.sourceKind.chat : m.ideas.sourceKind.paperReading}
              </SourceLabel>
            )}
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
  /** Enter commits the title, ⌘Enter or Ctrl+Enter the body, and Escape restores both. */
  const commitOrCancel = (multiline: boolean) => (event: KeyboardEvent<HTMLElement>) => {
    if (composing(event.nativeEvent)) return
    if (event.key === 'Escape') { event.stopPropagation(); cancelEditing(); return }
    if (multiline ? commitsMultiline(event.nativeEvent) : event.key === 'Enter') { event.preventDefault(); save() }
  }

  return (
    <aside className="idea-detail-panel" aria-label={m.ideas.detailHeading}>
      <header className="idea-detail-head">
        <span>{m.ideas.detailHeading}</span>
        <EditActions
          editing={editing} saving={busy} canSave={title.trim() !== '' && body.trim() !== ''}
          onEdit={startEditing} onCancel={cancelEditing} onSave={save}
        />
        <PanelClose onClose={onClose} />
      </header>

      {editing
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
        : (
          <>
            <div className="idea-detail-title-row">
              <h2>{idea.title}</h2>
              {idea.archived ? <Tag>{m.common.archived}</Tag> : null}
            </div>
            <section className="idea-detail-section">
              <SectionHeading variant="rail">{m.ideas.bodyLabel}</SectionHeading>
              <p className="idea-detail-body">{idea.body}</p>
            </section>
          </>
        )}

      <section className="idea-detail-section">
        <SectionHeading
          variant="rail"
          actions={idea.project === undefined
            ? <button className="btn sm" onClick={onPromote}>{m.ideas.promote.action}</button>
            : linked === undefined
              ? undefined
              : <button className="btn sm" onClick={() => onOpen('project', linked.id)}>{m.ideas.promote.openProject}</button>}
        >{m.ideas.link.heading}
        </SectionHeading>
        <ChoicePicker
          appearance="field" aria-label={m.ideas.link.selectAriaLabel(idea.title)} value={idea.project ?? ''}
          options={[
            '',
            ...(idea.project !== undefined && linked === undefined ? [idea.project] : []),
            ...projects.map((project) => project.id),
          ]}
          label={(id) => {
            if (id === '') return m.ideas.link.none
            const project = projects.find((candidate) => candidate.id === id)
            return project === undefined ? m.ideas.link.originalUnavailable : `${project.name} · ${project.status}`
          }}
          onPick={(id) => onProject(id || null)}
        />
        {idea.project !== undefined && linked === undefined
          ? <div className="idea-missing-project">{m.ideas.link.originalUnavailable}</div>
          : null}
      </section>

      <section className="idea-detail-section idea-detail-source">
        <SectionHeading
          variant="rail"
          actions={idea.source.chatId === undefined
            ? undefined
            : <button className="btn sm" onClick={() => onOpen('chat', idea.source.chatId!)}>{m.ideas.openSourceChat}</button>}
        >{m.project.sections.source}
        </SectionHeading>
        <p>{sourceLabel(idea)}</p>
        <div className="idea-detail-meta">{m.common.updatedOn(fmt.date(idea.updated))}</div>
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
  const [archiveOpen, setArchiveOpen] = useState(false)
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
              <CollapsibleGroup
                variant="quiet" title={m.common.archived} count={archived.length}
                open={archiveOpen || archived.some((idea) => idea.id === selectedId)}
                onToggle={() => setArchiveOpen((open) => !open)}
              >
                {archived.map(card)}
              </CollapsibleGroup>
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
